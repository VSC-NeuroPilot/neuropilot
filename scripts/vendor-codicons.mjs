import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-check

const fsp = fs.promises;

async function exists(p) {
    try { await fsp.access(p); return true; } catch { return false; }
}

async function copyRecursiveFallback(src, dest) {
    const lst = await fsp.lstat(src);
    if (lst.isSymbolicLink()) {
        const real = await fsp.realpath(src);
        return copyRecursiveFallback(real, dest);
    }
    if (lst.isDirectory()) {
        await fsp.mkdir(dest, { recursive: true });
        const items = await fsp.readdir(src);
        for (const it of items) {
            await copyRecursiveFallback(path.join(src, it), path.join(dest, it));
        }
    } else if (lst.isFile()) {
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(src, dest);
    } else {
    // other (socket, fifo...) — skip
    }
}

async function copyDir(src, dest) {
    // prefer fs.cp when available (Node 16.7+)
    if (typeof fs.cp === 'function') {
    // use dereference so symlinked files are copied as files (pnpm virtual store)
        await fs.promises.mkdir(dest, { recursive: true });
        await fs.promises.cp(src, dest, { recursive: true, dereference: true });
    } else {
        await copyRecursiveFallback(src, dest);
    }
}

async function main() {
    try {
        const destArg = process.argv[2] || 'media/codicons';
        const destDir = path.resolve(destArg);

        let pkgJsonPath;
        try {
            // find the package.json for @vscode/codicons
            pkgJsonPath = path.resolve('./node_modules/@vscode/codicons/package.json');
        } catch {
            console.error('Could not resolve @vscode/codicons. Make sure it is installed (run pnpm install).');
            process.exit(2);
        }

        const pkgDir = path.dirname(pkgJsonPath);
        const candidates = [
            path.join(pkgDir, 'dist'),
            path.join(pkgDir, 'out'),
            path.join(pkgDir, 'lib'),
            pkgDir,
        ];

        let srcDir = null;
        for (const c of candidates) {
            if (await exists(c)) { srcDir = c; break; }
        }

        if (!srcDir) {
            console.error('Could not find codicons files in the package (no dist/out/lib). Aborting.');
            process.exit(3);
        }

        console.log(`Vendoring @vscode/codicons from: ${srcDir}`);
        console.log(`→ destination: ${destDir}`);

        // copy
        await copyDir(srcDir, destDir);

        console.log('Done.');
    } catch (erm) {
        console.error('Error while vendoring codicons:', erm);
        process.exit(1);
    }
}

main();

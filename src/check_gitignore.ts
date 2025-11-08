import * as vscode from 'vscode';
import * as path from 'path';
import ignore from 'ignore';

/**
 * Recursively find the first path that is ignored by .gitignore
 * @param baseDir - Root directory where .gitignore is located (absolute path)
 * @param targets - List of file or folder paths to check (absolute or relative to baseDir)
 * @returns The first ignored path found, or false if none match
 */
export async function findIgnoredFile(
    baseDir: string,
    targets: string[],
): Promise<string | false> {
    const gitignoreUri = vscode.Uri.file(path.join(baseDir, '.gitignore'));

    // Check .gitignore existence
    try {
        await vscode.workspace.fs.stat(gitignoreUri);
    } catch {
        throw new Error(`.gitignore not found in: ${baseDir}`);
    }

    const ig = ignore();

    // Load .gitignore content
    const gitignoreBytes = await vscode.workspace.fs.readFile(gitignoreUri);
    const gitignoreContent = Buffer.from(gitignoreBytes).toString('utf8');
    ig.add(gitignoreContent);

    /**
   * Recursively walk through a folder and return first ignored file/folder
   */
    async function checkRecursive(targetPath: string): Promise<string | false> {
        const relPath = path.relative(baseDir, targetPath);

        // Check if this path itself is ignored
        if (ig.ignores(relPath)) {
            return targetPath;
        }

        // Check if directory
        const targetUri = vscode.Uri.file(targetPath);
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(targetUri);
        } catch {
            return false;
        }

        if (stat.type === vscode.FileType.Directory) {
            const entries = await vscode.workspace.fs.readDirectory(targetUri);
            for (const [name, type] of entries) {
                const childPath = path.join(targetPath, name);
                const result = await checkRecursive(childPath);
                if (result) return result;
            }
        }

        return false;
    }

    // Process targets
    for (const target of targets) {
        const absPath = path.isAbsolute(target)
            ? target
            : path.join(baseDir, target);
        const result = await checkRecursive(absPath);
        if (result) return result;
    }

    return false;
}

// Example usage for testing inside VSCode extension (command)
export async function testFindIgnoredFile() {
    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!baseDir) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const targets = ['src', 'node_modules', 'package-lock.json'];
    const result = await findIgnoredFile(baseDir, targets);
    vscode.window.showInformationMessage(
        result ? `Ignored: ${result}` : 'No ignored files found',
    );
}

import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a JavaScript file, finds `function run()` declarations,
 * and prepends or removes `export ` as requested.
 * Throws if already exported/unexported.
 * @param filePath Absolute or relative path to the JS file.
 * @param unexport If true, removes export; otherwise, adds export.
 */
function toggleExportRunFunction(filePath: string, unexport: boolean) {
    const absPath = path.resolve(filePath);
    let content = fs.readFileSync(absPath, 'utf8');

    // Regex for exported and unexported function run
    const exportRegex = /^(\s*)export\s+function\s+run\s*\(/gm;
    const unexportedRegex = /^(\s*)function\s+run\s*\(/gm;

    if (unexport) {
        // If not exported, throw error
        if (!exportRegex.test(content)) {
            throw new Error('Function "run" is not exported.');
        }
        // Remove export
        content = content.replace(exportRegex, '$1function run(');
    } else {
        // If already exported, throw error
        if (exportRegex.test(content)) {
            throw new Error('Function "run" is already exported.');
        }
        // Export function
        content = content.replace(unexportedRegex, '$1export function run(');
    }

    fs.writeFileSync(absPath, content, 'utf8');
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const unexport = args.includes('--unexport');
    const fileArg = args.find(arg => !arg.startsWith('--'));

    if (!fileArg) {
        console.error('Usage: tsx ./scripts/post-test-exporter.ts [--unexport] <path-to-js-file>');
        process.exit(1);
    }
    try {
        toggleExportRunFunction(fileArg, unexport);
        console.log(`${unexport ? 'Unexported' : 'Exported'}: ${fileArg}`);
    } catch (erm) {
        console.error(`Error: ${erm}`);
        process.exit(2);
    }
}

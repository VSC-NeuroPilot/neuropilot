import * as vscode from 'vscode';
import ignore, { Ignore } from 'ignore';

/**
 * A lightweight utility for managing and applying global ignore patterns,
 * similar to how `.gitignore` files work.
 *
 * This class wraps the `ignore` library to simplify the process of filtering
 * out files or folders that should not be included in operations like scanning,
 * indexing, or context building within the VSCode extension environment.
 *
 * ## Features
 * - Maintains an internal ignore list (`ignore` instance) with customizable global patterns.
 * - Allows adding new patterns dynamically without recreating the instance.
 * - Supports filtering file lists and checking whether individual paths are ignored.
 * - Designed to work with relative paths for consistency within workspace operations.
 *
 * ## Example
 * ```ts
 * const globals = ["node_modules/", "*.log", "dist/"];
 * const ignoreList = new IgnoreItemsList(globals);
 *
 * console.log(ignoreList.isIgnored("node_modules/test")); // true
 * console.log(ignoreList.isIgnored("src/index.ts")); // false
 *
 * ignoreList.addPatterns([".env"]);
 * console.log(ignoreList.isIgnored(".env")); // true
 *
 * const visible = ignoreList.filterVisible(["src", "node_modules", ".env"]);
 * console.log("Visible:", visible); // ["src"]
 * ```
 *
 * ## Typical Use Case
 * Used internally by NeuroPilot (VSCode extension) to efficiently exclude
 * irrelevant files (e.g. lock files, build artifacts, dependency directories)
 * from being loaded into the assistant’s context or processed by background tasks.
 */
export class IgnoreItemsList {
    private ig: Ignore;
    private globals: string[];

    constructor(globals: string[]) {
        this.globals = globals;
        this.ig = ignore();
        this.addGlobals(globals);
    }

    /**
   * Add or refresh the global ignore patterns
   * @param globals - Array of ignore patterns
   */
    addGlobals(globals: string[]): void {
        this.globals = globals;
        this.ig = ignore(); // reset instance
        this.ig.add(globals);
    }

    /**
   * Check if a given relative path is ignored
   * @param relPath - Path relative to the base directory
   * @returns true if ignored, false otherwise
   */
    isIgnored(relPath: string): boolean {
        return this.ig.ignores(relPath);
    }

    /**
   * Filter out ignored files/folders from a list
   * @param files - List of relative paths
   * @returns List of non-ignored files
   */
    filterVisible(files: string[]): string[] {
        return files.filter(file => !this.isIgnored(file));
    }

    /**
   * Add extra ignore patterns on top of the current globals
   * @param patterns - Array of ignore patterns
   */
    addPatterns(patterns: string[]): void {
        this.ig.add(patterns);
    }
}

/**
 * Example usage: test IgnoreItemsList directly
 */
export async function testIgnoreItemsList() {
    const globalPatterns = ['node_modules/', '*.log', 'dist/'];
    const ignoreList = new IgnoreItemsList(globalPatterns);

    console.log(ignoreList.isIgnored('node_modules/test')); // true
    console.log(ignoreList.isIgnored('src/index.ts')); // false

    ignoreList.addPatterns(['.env']);
    console.log(ignoreList.isIgnored('.env')); // true

    const visible = ignoreList.filterVisible(['src', 'node_modules', '.env']);
    console.log('Visible files:', visible); // ["src"]

    vscode.window.showInformationMessage(
        `IgnoreItemsList test finished. Visible: ${visible.join(', ')}`,
    );
}

// Create and export a single shared instance
export const GlobalIgnore = new IgnoreItemsList(['node_modules/', '*.log', 'dist/']);

/**
 * Load .gitignore and custom ignore files into the global Ignore instance.
 */
export async function loadIgnoreFiles(baseDir: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('neuropilot.access');
    const inheritFromIgnoreFiles = config.get<boolean>('inheritFromIgnoreFiles');
    const customIgnorePaths = config.get<string[]>('ignoreFiles') || [];

    if (!inheritFromIgnoreFiles) {
        vscode.window.showWarningMessage(
            'Permission to inherit from ignore files is disabled. (neuropilot.access.inheritFromIgnoreFiles)',
        );
        return;
    }

    // Fallback to .gitignore in baseDir
    if (customIgnorePaths.length === 0) {
        customIgnorePaths.push('.gitignore');
    }

    for (const relativePath of customIgnorePaths) {
        const ignoreUri = vscode.Uri.joinPath(vscode.Uri.file(baseDir), relativePath);
        try {
            await vscode.workspace.fs.stat(ignoreUri);
            const bytes = await vscode.workspace.fs.readFile(ignoreUri);
            const content = Buffer.from(bytes).toString('utf8');
            GlobalIgnore.addPatterns(content.split('\n'));
        } catch {
            vscode.window.showWarningMessage(`Ignore file not found: ${ignoreUri.fsPath}`);
        }
    }
}

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
    await loadIgnoreFiles(baseDir);

    async function checkRecursive(targetPath: string): Promise<string | false> {
        let relPath = vscode.workspace.asRelativePath(vscode.Uri.file(targetPath), false);

        // ensure it's truly relative (ignore requires normalized paths)
        relPath = relPath.replace(/^[/\\]+/, ''); 
        if (GlobalIgnore.isIgnored(relPath)) {
            return targetPath;
        }

        const targetUri = vscode.Uri.file(targetPath);
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(targetUri);
        } catch {
            return false;
        }

        if (stat.type === vscode.FileType.Directory) {
            const entries = await vscode.workspace.fs.readDirectory(targetUri);
            for (const [name] of entries) {
                const childPath = vscode.Uri.joinPath(targetUri, name);
                const result = await checkRecursive(childPath.fsPath);
                if (result) return result;
            }
        }

        return false;
    }

    for (const target of targets) {
        const fileUri = vscode.Uri.file(target);
        const absUri = target.startsWith(baseDir)
            ? fileUri
            : vscode.Uri.joinPath(vscode.Uri.file(baseDir), target);
        const result = await checkRecursive(absUri.fsPath);
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

/**
 * Check whether a given file or folder is ignored by .gitignore
 * @param baseDir - The root directory containing .gitignore
 * @param targetPath - The path (absolute or relative to baseDir) to check
 * @returns true if the file is ignored, false otherwise
 */
export async function isIgnoredFile(
    baseDir: string,
    targetPath: string,
): Promise<boolean> {
    const result = await findIgnoredFile(baseDir, [targetPath]);
    return !!result; // true if ignored, false otherwise
}

/**
 * Example usage: demonstrate using isIgnoredFile in a condition
 */
export async function testIsIgnoredFile() {
    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!baseDir) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const checkPath = 'node_modules'; // example
    if (await isIgnoredFile(baseDir, checkPath)) {
        vscode.window.showInformationMessage(`${checkPath} is ignored.`);
    } else {
        vscode.window.showInformationMessage(`${checkPath} is NOT ignored.`);
    }
}


/**
 * Filter out ignored files/folders based on .gitignore
 * @param baseDir - The root directory containing .gitignore
 * @param files - Array of file or folder paths (absolute or relative to baseDir)
 * @returns A list of visible (non-ignored) files/folders
 */
export async function getVisibleFiles(
    baseDir: string,
    files: string[],
): Promise<string[]> {
    const visible: string[] = [];
    for (const file of files) {
        if (!await isIgnoredFile(baseDir, file)) {
            visible.push(file);
        }
    }
    return visible;
}

/**
 * Example usage: demonstrate using getVisibleFiles
 */
export async function testGetVisibleFiles() {
    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!baseDir) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    const files = ['src', 'node_modules', 'package-lock.json'];
    const visible = await getVisibleFiles(baseDir, files);

    vscode.window.showInformationMessage(
        visible.length
            ? `Visible files: ${visible.join(', ')}`
            : 'All files are ignored.',
    );
}

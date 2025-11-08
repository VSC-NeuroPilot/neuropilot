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
    // Permission check
    const config = vscode.workspace.getConfiguration('neuropilot.access');
    const inheritFromIgnoreFiles = config.get<boolean>('inheritFromIgnoreFiles');

    // This variable takes priority from the default .gitignore path
    const customIgnorePaths = config.get<string[]>('ignoreFiles') || [];

    // Fallback to default .gitignore if empty
    if (customIgnorePaths.length === 0) {
        customIgnorePaths.push(vscode.Uri.joinPath(vscode.Uri.file(baseDir), '.gitignore').fsPath);
    }

    // If permission is denied, return false
    if (!inheritFromIgnoreFiles) {
        vscode.window.showWarningMessage(
            'You disabled the permission for neuro to ignore the files (like libraries, lock files, etc) '
            + 'that is critical for her to not get overly long context messages when she tries to get the list of files '
            + 'and directories (neuropilot.access.inheritFromIgnoreFiles). You can enable it from the settings if you want to change this behavior.',
        );
        return false;
    }

    const ig = ignore();

    // Load all ignore file's content
    for (const filePath of customIgnorePaths) {
        const baseUri = vscode.Uri.file(baseDir);
        const ignoreFileUri = vscode.Uri.joinPath(baseUri, filePath);

        // Check the ignore list file's existence
        try {
            await vscode.workspace.fs.stat(ignoreFileUri);
        } catch {
            throw new Error(`.gitignore not found in: ${baseDir}`);
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(ignoreFileUri);
            const content = Buffer.from(bytes).toString('utf8');
            ig.add(content);
        } catch {
            vscode.window.showWarningMessage(`Ignore file not found: ${ignoreFileUri.fsPath}`);
        }
    }

    /**
   * Recursively walk through a folder and return first ignored file/folder
   */
    async function checkRecursive(targetPath: string): Promise<string | false> {
        const relPath = vscode.workspace.asRelativePath(vscode.Uri.file(targetPath), false);

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
            for (const [name] of entries) {
                const childPath = vscode.Uri.joinPath(vscode.Uri.file(targetPath), name);
                const result = await checkRecursive(childPath.fsPath);
                if (result) return result;
            }
        }

        return false;
    }

    // Process targets
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

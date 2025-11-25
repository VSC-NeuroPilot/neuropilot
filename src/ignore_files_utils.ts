import * as vscode from 'vscode';
import ignore, { Ignore } from 'ignore';
import { ACCESS } from './config';
import { isWindows } from './utils';

const ignoreCache = new Map<string, boolean>();

function clearIgnoreCache(): void {
    ignoreCache.clear();
}

export function resetIgnoreCache(): void {
    clearIgnoreCache();
}

export function resetIgnoreState(globals?: string[]): void {
    GlobalIgnore.setGlobals(globals ?? ['node_modules/', '*.log', 'dist/']);
    clearIgnoreCache();
}

function cacheKeyFor(path: string): string {
    return isWindows() ? path.toLowerCase() : path;
}

function toRelativePath(targetPath: string): string {
    const relPath = vscode.workspace.asRelativePath(targetPath, false);
    return relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
}

function isAbsolutePath(targetPath: string): boolean {
    return /^[a-zA-Z]:[\\/]/.test(targetPath) || targetPath.startsWith('/') || targetPath.startsWith('\\');
}

function resolveTargetPath(baseDir: string, targetPath: string): string {
    if (isAbsolutePath(targetPath)) {
        return targetPath;
    }
    return vscode.Uri.joinPath(vscode.Uri.file(baseDir), targetPath).fsPath;
}

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
export class ProfessionalIgnorer {
    private ig: Ignore;
    private globals: string[];

    constructor(globals: string[]) {
        this.globals = globals;
        this.ig = ignore();
        this.setGlobals(globals);
    }

    /**
   * Refresh the global ignore patterns
   * @param globals - Array of ignore patterns
   */
    setGlobals(globals: string[]): void {
        this.globals = globals;
        this.ig = ignore(); // reset instance
        this.ig.add(globals);
        clearIgnoreCache();
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
        clearIgnoreCache();
    }
}

/**
 * Example usage: test IgnoreItemsList directly
 */
export async function testIgnoreItemsList() {
    const globalPatterns = ['node_modules/', '*.log', 'dist/'];
    const ignoreList = new ProfessionalIgnorer(globalPatterns);

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
export const GlobalIgnore = new ProfessionalIgnorer(['node_modules/', '*.log', 'dist/']);

/**
 * Load .gitignore and custom ignore files into the global Ignore instance.
 */
export async function loadIgnoreFiles(baseDir: string): Promise<void> {
    const inheritFromIgnoreFiles = ACCESS.inheritFromIgnoreFiles;
    const customIgnorePaths = ACCESS.ignoreFiles;

    // Use global storage key for suppression
    const suppressionKey = 'neuropilot.access.suppressIgnoreWarning';
    const suppressed = vscode.workspace.getConfiguration().get<boolean>(suppressionKey, false);

    if (!inheritFromIgnoreFiles) {
        if (!suppressed) {
            const selection = await vscode.window.showWarningMessage(
                'Permission to inherit Neuro-unsafe paths from ignore files is disabled.',
                'Don’t show again',
            );

            if (selection === 'Don’t show again') {
                // Save suppression in global settings
                await vscode.workspace
                    .getConfiguration()
                    .update(suppressionKey, true, vscode.ConfigurationTarget.Global);

                vscode.window.showInformationMessage('Ignore file warnings will no longer appear.');
            }
        }
        return;
    }

    for (const relativePath of customIgnorePaths) {
        const ignoreUri = vscode.Uri.joinPath(vscode.Uri.file(baseDir), relativePath);
        try {
            await vscode.workspace.fs.stat(ignoreUri);
            const bytes = await vscode.workspace.fs.readFile(ignoreUri);
            const content = Buffer.from(bytes).toString('utf8');
            GlobalIgnore.setGlobals(content.split('\n'));
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
        const relPath = toRelativePath(targetPath);
        if (relPath !== '' && GlobalIgnore.isIgnored(relPath)) {
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
        const absPath = resolveTargetPath(baseDir, target);
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

/**
 * Find the first ignored path from a list (non-recursive).
 * @returns The first ignored file, or false if none.
 */
export async function fastIsFileIgnored(
    baseDir: string,
    targets: string[],
): Promise<string | false> {
    await loadIgnoreFiles(baseDir);

    for (const target of targets) {
        const absPath = resolveTargetPath(baseDir, target);
        if (fastIsItIgnored(absPath)) {
            return target;
        }
    }

    return false;
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
 * Fast check whether a given file or folder is ignored by .gitignore (non-recursive).
 */
export function fastIsItIgnored(targetPath: string): boolean {
    const relPath = toRelativePath(targetPath);
    if (
        relPath === ''
        || relPath.startsWith('..')
        || /^[a-z]:/i.test(relPath)
    ) {
        return false;
    }

    const key = cacheKeyFor(relPath);
    const cached = ignoreCache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    const ignored = GlobalIgnore.isIgnored(relPath);
    ignoreCache.set(key, ignored);
    return ignored;
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
    await loadIgnoreFiles(baseDir);

    const visible: string[] = [];
    for (const file of files) {
        const absPath = resolveTargetPath(baseDir, file);
        if (!fastIsItIgnored(absPath)) {
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

/**
 * Filter out ignored files/folders based on cached .gitignore rules.
 */
export async function fastIsTheFilesVisible(
    baseDir: string,
    files: string[],
): Promise<string[]> {
    await loadIgnoreFiles(baseDir);

    return files.filter(file => {
        const absPath = resolveTargetPath(baseDir, file);
        return !fastIsItIgnored(absPath);
    });
}

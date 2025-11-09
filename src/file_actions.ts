import * as vscode from 'vscode';

import { NEURO } from '@/constants';
import { formatContext, getFence, getPositionContext, getVirtualCursor, getWorkspacePath, getWorkspaceUri, isBinary, isPathNeuroSafe, logOutput, normalizePath, notifyOnCaughtException, stripTailSlashes } from '@/utils';
import { ActionData, contextNoAccess, RCEAction, actionValidationFailure, actionValidationAccept, ActionValidationResult, stripToActions } from '@/neuro_client_helper';
import { CONFIG, PERMISSIONS, PermissionLevel, getPermissionLevel, isActionEnabled } from '@/config';
import { targetedFileCreatedEvent, targetedFileDeletedEvent } from '@events/files';
import { RCECancelEvent } from '@events/utils';

/**
 * The path validator.
 * @param path The relative path to the file/folder.
 * @param shouldExist Whether the file/folder should exist for validation to succeed. `true` returns a failure if it doesn't exist, `false` returns a failure if it does.
 * @param pathType What type of path it is.
 * @returns A validation message. {@link actionValidationFailure} if any validation steps fail, {@link actionValidationAccept} otherwise.
 */
async function validatePath(path: string, shouldExist: boolean, pathType: string): Promise<ActionValidationResult> {
    if (path === '') {
        return actionValidationFailure('No file path specified.', true);
    };
    const relativePath = normalizePath(path).replace(/^\/|\/$/g, '');
    const absolutePath = (getWorkspacePath() ?? '') + '/' + relativePath;
    if (!isPathNeuroSafe(absolutePath)) {
        return actionValidationFailure(`You are not allowed to access this ${pathType}.`);
    }
    const base = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!base) {
        return actionValidationFailure('You are not in a workspace.');
    }

    const doesExist = await getUriExistence(vscode.Uri.joinPath(base, relativePath));
    if (!shouldExist && doesExist) {
        return actionValidationFailure(`${pathType} "${path}" already exists.`);
    } else if (shouldExist && !doesExist) {
        return actionValidationFailure(`${pathType} "${path}" doesn't exist.`);
    }

    return actionValidationAccept();
};

async function getUriExistence(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch (erm: unknown) {
        if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') return false;
        else throw erm;
    }
}

async function neuroSafeValidation(actionData: ActionData): Promise<ActionValidationResult> {
    let result: ActionValidationResult = actionValidationAccept();
    const falseList = [
        'open_file',
        'read_file',
    ];
    const shouldExist = falseList.includes(actionData.name);
    if (actionData.params?.filePath) {
        result = await validatePath(actionData.params.filePath, shouldExist, 'file');
    }
    if (!result.success) return result;
    if (actionData.params?.folderPath) {
        result = await validatePath(actionData.params.folderPath, shouldExist, 'folder');
    }
    return result;
}

async function neuroSafeDeleteValidation(actionData: ActionData): Promise<ActionValidationResult> {
    const check = await validatePath(actionData.params.path, true, actionData.params.recursive ? 'folder' : 'file');
    if (!check.success) return check;

    const base = vscode.workspace.workspaceFolders![0].uri;
    const relative = normalizePath(actionData.params.path).replace(/^\/|\/$/g, '');
    const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(base, relative));
    if (stat.type === vscode.FileType.File && actionData.params.recursive)
        return actionValidationFailure(`Cannot delete file ${actionData.params.path} with recursive.`);
    else if (stat.type === vscode.FileType.Directory && !actionData.params.recursive)
        return actionValidationFailure(`Cannot delete directory ${actionData.params.path} without recursive.`);

    return actionValidationAccept();
}

async function neuroSafeRenameValidation(actionData: ActionData): Promise<ActionValidationResult> {
    let check = await validatePath(actionData.params.oldPath, true, 'directory');
    if (!check.success) return check;
    check = await validatePath(actionData.params.newPath, false, 'directory');
    if (!check.success) return check;

    return actionValidationAccept();
}

/**
 * Validate if the file is a binary file.
 * Always fails for folders.
 * @param actionData The action data.
 * @returns The validation result.
 */
async function binaryFileValidation(actionData: ActionData): Promise<ActionValidationResult> {
    const relativePath = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri();

    if (!workspaceUri)
        return actionValidationFailure('You are not in a workspace.');

    const absolutePath = normalizePath(workspaceUri.fsPath + '/' + relativePath.replace(/^\/|\/$/g, ''));
    const uri = workspaceUri.with({ path: absolutePath });

    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.File)
            return actionValidationFailure('The specified path is not a file.');
    } catch {
        return actionValidationFailure('Specified file does not exist.');
    }

    const file = await vscode.workspace.fs.readFile(uri);
    if (await isBinary(file)) {
        return actionValidationFailure('You cannot open a binary file.');
    }
    return actionValidationAccept();
}

/**
 * Validates if the targeted file is a file.
 * @returns The validation result.
 */
async function validateIsAFile(actionData: ActionData): Promise<ActionValidationResult> {
    const filePath = actionData.params?.filePath;
    if (!filePath)
        return actionValidationFailure('No file path specified.', true);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
        return actionValidationFailure('You are not in an open workspace.');

    const normalizedPath = normalizePath(filePath).replace(/^\/|\/$/g, '');
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length === 0)
        return actionValidationFailure('No file path specified.', true);
    const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, ...segments);

    try {
        const stat = await vscode.workspace.fs.stat(fullPath);
        const isDirectory = (stat.type & vscode.FileType.Directory) === vscode.FileType.Directory;
        const isFile = (stat.type & vscode.FileType.File) === vscode.FileType.File;

        if (isDirectory)
            return actionValidationFailure(`${filePath} is a directory, not a file.`);
        if (!isFile)
            return actionValidationFailure(`${filePath} is not a file.`);
    } catch (erm: unknown) {
        if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound')
            return actionValidationFailure(`${filePath} does not exist.`);
        throw erm;
    }

    return actionValidationAccept();
}

const commonFileEvents: ((actionData: ActionData) => RCECancelEvent | null)[] = [
    (actionData: ActionData) => targetedFileCreatedEvent(actionData.params?.filePath),
    (actionData: ActionData) => targetedFileDeletedEvent(actionData.params?.filePath),
];

export const fileActions = {
    get_workspace_files: {
        name: 'get_workspace_files',
        description: 'Get a list of files in the workspace. Will not return subdirectories by default, use `recursive` to do so.',
        schema: {
            type: 'object',
            properties: {
                folder: { type: 'string', description: 'If you want to view only a subfolder\'s contents, specify a subfolder in this property. If not specified, defaults to the workspace root.' },
                recursive: { type: 'boolean', description: 'Set this to `true` if you want to view all subfolders\' contents as well.' },
            },
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.openFiles],
        handler: handleGetWorkspaceFiles,
        validators: [async (actionData: ActionData) => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder === undefined)
                return actionValidationFailure('No open workspace to get files from.');
            let folder = actionData.params?.folder as string;
            if (folder) {
                folder = stripTailSlashes(folder);
                const relativeFolderPath = normalizePath(folder);
                const pathValidated = await validatePath(relativeFolderPath, true, 'folder');
                if (!pathValidated.success) return pathValidated;
                const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, relativeFolderPath));
                if (stat.type !== vscode.FileType.Directory) return actionValidationFailure('The specified path is not a directory.');
            }
            return actionValidationAccept();
        }],
        cancelEvents: [
            (actionData: ActionData) => {
                if (actionData.params?.folder) {
                    return targetedFileDeletedEvent(stripTailSlashes(actionData.params.folder));
                } else return null;
            },
        ],
        promptGenerator: (actionData: ActionData) => `${actionData.params?.recursive ? 'Recursively get' : 'Get'} a list of files in ${actionData.params?.folder ? `"${stripTailSlashes(actionData.params.folder)}"` : 'the workspace'}.`,
    },
    open_file: {
        name: 'open_file',
        description: 'Open a file in the workspace. You cannot open a binary file directly.',
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the file.', examples: ['src/index.ts', './main.py'] },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.openFiles],
        handler: handleOpenFile,
        cancelEvents: commonFileEvents,
        validators: [neuroSafeValidation, binaryFileValidation, validateIsAFile],
        promptGenerator: (actionData: ActionData) => `open the file "${actionData.params?.filePath}".`,
    },
    read_file: {
        name: 'read_file',
        description: 'Read a file\'s contents without opening it.',
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the file.', examples: ['./index.html', 'style.css', 'src/main.js'] },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.openFiles],
        handler: handleReadFile,
        cancelEvents: commonFileEvents,
        validators: [neuroSafeValidation, binaryFileValidation, validateIsAFile],
        promptGenerator: (actionData: ActionData) => `read the file "${actionData.params?.filePath}" (without opening it).`,
    },
    create_file: {
        name: 'create_file',
        description: 'Create a new file at the specified path. The path should include the name of the new file.',
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the new file.', examples: ['./newfile.py', 'src/module.js'] },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.create],
        handler: handleCreateFile,
        cancelEvents: commonFileEvents,
        validators: [neuroSafeValidation],
        promptGenerator: (actionData: ActionData) => `create the file "${actionData.params?.filePath}".`,
    },
    create_folder: {
        name: 'create_folder',
        description: 'Create a new folder at the specified path. The path should include the name of the new folder.',
        schema: {
            type: 'object',
            properties: {
                folderPath: { type: 'string', description: 'The relative path to the folder.', examples: ['./src', 'public'] },
            },
            required: ['folderPath'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.create],
        handler: handleCreateFolder,
        cancelEvents: [
            (actionData: ActionData) => targetedFileCreatedEvent(actionData.params?.folderPath),
        ],
        validators: [neuroSafeValidation],
        promptGenerator: (actionData: ActionData) => `create the folder "${actionData.params?.folderPath}".`,
    },
    rename_file_or_folder: {
        name: 'rename_file_or_folder',
        description: 'Rename a file or folder. Specify the full relative path for both the old and new names.',
        schema: {
            type: 'object',
            properties: {
                oldPath: { type: 'string', description: 'The relative path to the old directory.', examples: ['src', './main.py'] },
                newPath: { type: 'string', description: 'The relative path to the new directory.', examples: ['wip', './new.py'] },
            },
            required: ['oldPath', 'newPath'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.rename],
        handler: handleRenameFileOrFolder,
        cancelEvents: [
            (actionData: ActionData) => targetedFileCreatedEvent(actionData.params?.newPath),
            (actionData: ActionData) => targetedFileDeletedEvent(actionData.params?.oldPath),
        ],
        validators: [neuroSafeRenameValidation],
        promptGenerator: (actionData: ActionData) => `rename "${actionData.params?.oldPath}" to "${actionData.params?.newPath}".`,
    },
    delete_file_or_folder: {
        name: 'delete_file_or_folder',
        description: 'Delete a file or folder. If you want to delete a folder, set the "recursive" parameter to true.',
        schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'The relative path to the file/folder to delete.', examples: ['src/index.ts', './utils'] },
                recursive: { type: 'boolean', description: 'If set to true, enables you to delete a folder and all its sub-folders.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.delete],
        handler: handleDeleteFileOrFolder,
        cancelEvents: [
            (actionData: ActionData) => targetedFileDeletedEvent(actionData.params?.path),
        ],
        validators: [neuroSafeDeleteValidation],
        promptGenerator: (actionData: ActionData) => `delete "${actionData.params?.path}".`,
    },
} satisfies Record<string, RCEAction>;

export function registerFileActions() {
    if (getPermissionLevel(PERMISSIONS.openFiles)) {
        NEURO.client?.registerActions(stripToActions([
            fileActions.get_workspace_files,
            fileActions.open_file,
            fileActions.read_file,
        ]).filter(isActionEnabled));
    }

    if (getPermissionLevel(PERMISSIONS.create)) {
        NEURO.client?.registerActions(stripToActions([
            fileActions.create_file,
            fileActions.create_folder,
        ]).filter(isActionEnabled));
    }

    if (getPermissionLevel(PERMISSIONS.rename)) {
        NEURO.client?.registerActions(stripToActions([
            fileActions.rename_file_or_folder,
        ]).filter(isActionEnabled));
    }

    if (getPermissionLevel(PERMISSIONS.delete)) {
        NEURO.client?.registerActions(stripToActions([
            fileActions.delete_file_or_folder,
        ]).filter(isActionEnabled));
    }
}

export function handleCreateFile(actionData: ActionData): string | undefined {
    const relativePathParam = actionData.params.filePath;
    const relativePath = normalizePath(relativePathParam).replace(/^\//, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if (!isPathNeuroSafe(absolutePath))
        return contextNoAccess(absolutePath);

    checkAndOpenFileAsync(absolutePath, relativePath);

    return;

    // Function to avoid pyramid of doom
    async function checkAndOpenFileAsync(absolutePath: string, relativePath: string) {
        const fileUri = getWorkspaceUri()!.with({ path: absolutePath });

        // Check if the file already exists
        try {
            await vscode.workspace.fs.stat(fileUri);
            // If no error is thrown, the file already exists
            NEURO.client?.sendContext(`Could not create file: File ${relativePath} already exists`);
            return;
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('create_file', erm);
                return;
            };
            /* else, file does not exist, continue */
        }

        // Create the file
        try {
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
        } catch (erm: unknown) {
            notifyOnCaughtException('create_file', erm);
            NEURO.client?.sendContext(`Failed to create file ${relativePath}`);
            return;
        }

        logOutput('INFO', `Created file ${relativePath}`);
        NEURO.client?.sendContext(`Created file ${relativePath}`);

        // Open the file if Neuro has permission to do so
        if (getPermissionLevel(PERMISSIONS.openFiles) !== PermissionLevel.AUTOPILOT)
            return;

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
            NEURO.client?.sendContext(`Opened new file ${relativePath}`);
        } catch (erm: unknown) {
            logOutput('ERROR', `Failed to open new file ${relativePath}: ${erm}`);
            NEURO.client?.sendContext(`Failed to open new file ${relativePath}`);
        }
    }
}

export function handleCreateFolder(actionData: ActionData): string | undefined {
    const relativePathParam = actionData.params.folderPath;
    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;

    checkAndCreateFolderAsync(absolutePath, relativePath);

    return;

    // Function to avoid pyramid of doom
    async function checkAndCreateFolderAsync(absolutePath: string, relativePath: string) {
        const base = vscode.workspace.workspaceFolders![0].uri;
        const folderUri = vscode.Uri.joinPath(base, relativePath);

        // Check if the folder already exists
        try {
            await vscode.workspace.fs.stat(folderUri);
            // If no error is thrown, the folder already exists
            NEURO.client?.sendContext(`Could not create folder: Folder ${relativePath} already exists`);
            return;
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('create_folder', erm);
                return;
            }
            /* else, folder does not exist, continue */
        }

        // Create the folder
        try {
            await vscode.workspace.fs.createDirectory(folderUri);
        } catch (erm: unknown) {
            notifyOnCaughtException('create_folder', erm);
            NEURO.client?.sendContext(`Failed to create folder ${relativePath}`);
            return;
        }

        logOutput('INFO', `Created folder ${relativePath}`);
        NEURO.client?.sendContext(`Created folder ${relativePath}`);
    }
}

export function handleRenameFileOrFolder(actionData: ActionData): string | undefined {
    const oldRelativePathParam = actionData.params.oldPath;
    const newRelativePathParam = actionData.params.newPath;

    const oldRelativePath = normalizePath(oldRelativePathParam).replace(/^\/|\/$/g, '');
    const newRelativePath = normalizePath(newRelativePathParam).replace(/^\/|\/$/g, '');
    const oldAbsolutePath = getWorkspacePath() + '/' + oldRelativePath;
    const newAbsolutePath = getWorkspacePath() + '/' + newRelativePath;

    checkAndRenameAsync(oldAbsolutePath, oldRelativePath, newAbsolutePath, newRelativePath);

    return;

    // Function to avoid pyramid of doom
    async function checkAndRenameAsync(oldAbsolutePath: string, oldRelativePath: string, newAbsolutePath: string, newRelativePath: string) {
        const oldUri = getWorkspaceUri()!.with({ path: oldAbsolutePath });
        const newUri = getWorkspaceUri()!.with({ path: newAbsolutePath });

        // Check if the new path already exists
        try {
            await vscode.workspace.fs.stat(newUri);
            // If no error is thrown, the new path already exists
            NEURO.client?.sendContext(`Could not rename: ${newRelativePath} already exists`);
            return;
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('rename_file_or_folder', erm);
                return;
            };
            /* New path does not exist, continue */
        }

        // Rename the file/folder
        try {
            await vscode.workspace.fs.rename(oldUri, newUri);
        } catch (erm: unknown) {
            notifyOnCaughtException('rename_file_or_folder', erm);
            NEURO.client?.sendContext(`Failed to rename ${oldRelativePath} to ${newRelativePath}`);
            return;
        }

        logOutput('INFO', `Renamed ${oldRelativePath} to ${newRelativePath}`);
        NEURO.client?.sendContext(`Renamed ${oldRelativePath} to ${newRelativePath}`);
    }
}

export function handleDeleteFileOrFolder(actionData: ActionData): string | undefined {
    const relativePathParam = actionData.params.path;
    const recursive = actionData.params.recursive ?? false;

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;

    checkAndDeleteAsync(absolutePath, relativePath, recursive);

    return;

    // Function to avoid pyramid of doom
    async function checkAndDeleteAsync(absolutePath: string, relativePath: string, recursive: boolean) {
        const base = vscode.workspace.workspaceFolders![0].uri;
        const uri = vscode.Uri.joinPath(base, relativePath);
        let stat: vscode.FileStat;

        // Check if the path exists
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') {
                NEURO.client?.sendContext(`Could not delete: ${relativePath} does not exist`);
                return;
            } else {
                notifyOnCaughtException('delete_file_or_folder', erm);
                return;
            }
        }

        // Check for correct recursive parameter
        if (stat.type === vscode.FileType.Directory && !recursive) {
            NEURO.client?.sendContext(`Could not delete: ${relativePath} is a directory cannot be deleted without the "recursive" parameter`);
            return;
        }

        // Delete the file/folder
        try {
            const useTrash = base.scheme === 'file';
            await vscode.workspace.fs.delete(uri, { recursive, useTrash });
        } catch (erm: unknown) {
            logOutput('ERROR', `Failed to delete ${relativePath}: ${erm}`);
            NEURO.client?.sendContext(`Failed to delete ${relativePath}`);
            return;
        }

        // If a file was deleted and it was open, close its editor tabs
        try {
            if (stat.type === vscode.FileType.File) {
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) {
                            await vscode.window.tabGroups.close(tab, true);
                        }
                    }
                }
                // Also ensure it's not in visibleTextEditors
                for (const editor of vscode.window.visibleTextEditors) {
                    if (editor.document.uri.toString() === uri.toString()) {
                        await vscode.window.showTextDocument(editor.document);
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    }
                }
                // Fallback: if still visible somewhere, close editors in all groups
                if (vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === uri.toString())) {
                    await vscode.commands.executeCommand('workbench.action.closeEditorsInAllGroups');
                }
            }
        } catch {
            // best-effort; ignore if closing fails
        }

        logOutput('INFO', `Deleted ${relativePath}`);
        NEURO.client?.sendContext(`Deleted ${relativePath}`);
    }
}

export function handleGetWorkspaceFiles(actionData: ActionData): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        logOutput('WARN', 'handleGetWorkspaceFiles called without an open workspace.');
        return undefined;
    }

    let folderUri = workspaceFolder.uri;
    const folder = actionData.params?.folder;
    if (folder) {
        const relativeFolderPath = normalizePath(stripTailSlashes(folder)).replace(/^\/|\/$/g, '');
        folderUri = vscode.Uri.joinPath(folderUri, ...relativeFolderPath.split('/').filter(Boolean));
    }
    listWorkspace(folderUri).then(
        (uris) => {
            const paths = uris
                .filter(uri => isPathNeuroSafe(uri[0].fsPath))
                .map(uri => {
                    let returnString = normalizePath(vscode.workspace.asRelativePath(uri[0]));
                    if (uri[1] === vscode.FileType.Directory) returnString += '/';
                    return returnString;
                })
                .sort((a, b) => {
                    const aParts = a.split('/');
                    const bParts = b.split('/');

                    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
                        if (aParts[i] !== bParts[i]) {
                            if (aParts.length === i + 1) return -1;
                            if (bParts.length === i + 1) return 1;
                            return aParts[i].localeCompare(bParts[i]);
                        }
                    }
                    return aParts.length - bParts.length;
                });
            const displayFolder = folder ? `"${stripTailSlashes(folder)}"` : 'workspace';
            logOutput('INFO', `Sending list of files in ${displayFolder} to Neuro`);
            NEURO.client?.sendContext(`Files in ${displayFolder}:\n\n${paths.join('\n')}`);
        },
        (erm: unknown) => {
            logOutput('ERROR', `Could not list workspace files: ${String(erm)}`);
            NEURO.client?.sendContext('Unable to list workspace files.');
        },
    );

    return undefined;

    async function listWorkspace(uri: vscode.Uri): Promise<[vscode.Uri, vscode.FileType][]> {
        const entries: [string, vscode.FileType][] = await vscode.workspace.fs.readDirectory(uri);
        const uriEntries: [vscode.Uri, vscode.FileType][] = entries.map(([name, type]) => [vscode.Uri.joinPath(uri, name), type]);

        const result: [vscode.Uri, vscode.FileType][] = [];
        for (const [childUri, fileType] of uriEntries) {
            if (await isPathNeuroSafe(childUri.fsPath)) {
                if (fileType === vscode.FileType.File) result.push([childUri, fileType]);
                else if (fileType === vscode.FileType.Directory) {
                    if (actionData.params?.recursive) {
                        result.push(...await listWorkspace(childUri));
                    } else {
                        result.push([childUri, fileType]);
                    }
                } else logOutput('WARNING', `Unhandled file type ${fileType}.`);
            }
        }

        return result;
    }
}

export function handleOpenFile(actionData: ActionData): string | undefined {
    const relativePath = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri()!;
    const relative = normalizePath(relativePath).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relative;
    if (!isPathNeuroSafe(absolutePath))
        return contextNoAccess(absolutePath);

    const fileUri = vscode.Uri.joinPath(workspaceUri, relative);

    openFileAsync();
    return;

    async function openFileAsync() {
        try {
            // Open via URI (not fsPath) to work across both file: and virtual workspace schemes
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);

            logOutput('INFO', `Opened file ${relativePath}`);

            // Usually handled by editorChangedHandler in editing.ts. If disabled, send content now.
            // Right after opening there may be no virtual cursor yet; in that case, send full file contents
            // so consumers (and tests) receive deterministic context.
            if (!CONFIG.sendContentsOnFileChange) {
                const cursor = getVirtualCursor();
                if (cursor === undefined || cursor === null) {
                    // No cursor available yet: send entire document
                    const decodedContent = document.getText();
                    const fence = getFence(decodedContent);
                    NEURO.client?.sendContext(`Contents of the file ${relativePath}:\n\n${fence}\n${decodedContent}\n${fence}`);
                } else {
                    // Cursor available: send contextual snippet around the cursor
                    const cursorContext = getPositionContext(document, cursor);
                    NEURO.client?.sendContext(formatContext(cursorContext));
                }
            }
        } catch (erm: unknown) {
            notifyOnCaughtException('open_file', erm);
            NEURO.client?.sendContext(`Failed to open file ${relativePath}`);
        }
    }
}

export function handleReadFile(actionData: ActionData): string | undefined {
    const file = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri()!;
    const absolute = normalizePath(workspaceUri.fsPath + '/' + file.replace(/^\/|\/$/g, ''));
    if (!isPathNeuroSafe(absolute)) {
        return contextNoAccess(file);
    }
    const fileAsUri = workspaceUri.with({ path: absolute });
    try {
        vscode.workspace.fs.readFile(fileAsUri).then(
            (data: Uint8Array) => {
                const decodedContent = new TextDecoder('utf-8').decode(data);
                const fence = getFence(decodedContent);
                NEURO.client?.sendContext(`Contents of the file ${file}:\n\n${fence}\n${decodedContent}\n${fence}`);
            },
            (erm: unknown) => {
                logOutput('ERROR', `Couldn't read file ${absolute}: ${erm}`);
                NEURO.client?.sendContext(`Couldn't read file ${file}.`);
            },
        );
    } catch (erm: unknown) {
        notifyOnCaughtException('read_file', erm);
        NEURO.client?.sendContext(`Unable to read file ${file}`);
    }
}

/**
 * Only for unit tests, DO NOT USE THESE EXPORTS IN PRODUCTION CODE.
 * @private
 */
export const _internals = {
    validatePath,
    getUriExistence,
    neuroSafeValidation,
    neuroSafeDeleteValidation,
    neuroSafeRenameValidation,
    validateIsAFile,
};

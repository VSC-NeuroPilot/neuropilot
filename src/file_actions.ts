import * as vscode from 'vscode';

import { EXCEPTION_THROWN_STRING, NEURO, PROMISE_REJECTION_STRING } from '@/constants';
import { filterFileContents, formatContext, getFence, getPositionContext, getProperty, getVirtualCursor, getWorkspacePath, getWorkspaceUri, isBinary, isPathNeuroSafe, logOutput, NeuroPositionContext, normalizePath, notifyOnCaughtException, simpleFileName, stripTailSlashes } from '@/utils/misc';
import { RCEAction, actionValidationFailure, actionValidationAccept, ActionValidationResult, actionValidationRetry, RCEHandlerReturns, actionHandlerSuccess, actionHandlerFailure } from '@/utils/neuro_client';
import { CONFIG, PermissionLevel, getPermissionLevel } from '@/config';
import { targetedFileCreatedEvent, targetedFileDeletedEvent } from '@events/files';
import { RCECancelEvent } from '@events/utils';
import { addActions } from './rce';
import { RCEContext } from '@ctx/rce';
import { filePreviewProvider } from '@/previews/files';
import assert from 'node:assert';

export const CATEGORY_FILE_ACTIONS = 'File Actions';
const ACTION_FAIL_NOTES = {
    noFilePath: 'Directory path left unspecified',
    noAccess: 'Access disallowed to targeted directory',
    noWorkspace: 'Not in a workspace',
    alreadyExists: 'Targeted path already exists',
    doesntExist: 'Targeted path does not exist',
    binaryFile: 'Targeted file is a binary file',
    targetedFile: 'Targeted path is a file',
    targetedFolder: 'Targeted path is a folder',
    incorrectType: 'Targeted path is not a file',
} as const;

/**
 * The path validator.
 * @param path The relative path to the file/folder.
 * @param shouldExist Whether the file/folder should exist for validation to succeed. `true` returns a failure if it doesn't exist, `false` returns a failure if it does.
 * @param pathType What type of path it is.
 * @returns A validation message. {@link actionValidationFailure} if any validation steps fail, {@link actionValidationAccept} otherwise.
 */
async function validatePath(path: string, shouldExist: boolean, pathType: string): Promise<ActionValidationResult> {
    if (path === '') {
        return actionValidationRetry('No file path specified.', ACTION_FAIL_NOTES.noFilePath);
    };
    const relativePath = normalizePath(path).replace(/^\/|\/$/g, '');
    const absolutePath = (getWorkspacePath() ?? '') + '/' + relativePath;
    if (!isPathNeuroSafe(absolutePath)) {
        return actionValidationFailure(`You are not allowed to access this ${pathType}.`, ACTION_FAIL_NOTES.noAccess);
    }
    const base = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!base) {
        return actionValidationFailure('You are not in a workspace.', ACTION_FAIL_NOTES.noWorkspace);
    }

    const doesExist = await getUriExistence(vscode.Uri.joinPath(base, relativePath));
    if (!shouldExist && doesExist) {
        return actionValidationFailure(`${pathType} "${path}" already exists.`, ACTION_FAIL_NOTES.alreadyExists.replace('path', pathType));
    } else if (shouldExist && !doesExist) {
        return actionValidationFailure(`${pathType} "${path}" doesn't exist.`, ACTION_FAIL_NOTES.doesntExist.replace('path', pathType));
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

function neuroSafeValidation(shouldExist = false) {
    return async ({ data: actionData}: RCEContext): Promise<ActionValidationResult> => {
        let result: ActionValidationResult = actionValidationAccept();
        if (actionData.params?.filePath) {
            result = await validatePath(actionData.params.filePath, shouldExist, 'file');
        }
        if (!result.success) return result;
        if (actionData.params?.folderPath) {
            result = await validatePath(actionData.params.folderPath, shouldExist, 'folder');
        }
        return result;
    };
}

async function neuroSafeDeleteValidation(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    const check = await validatePath(actionData.params.path, true, actionData.params.recursive ? 'folder' : 'file');
    if (!check.success) return check;

    const base = vscode.workspace.workspaceFolders![0].uri;
    const relative = normalizePath(actionData.params.path).replace(/^\/|\/$/g, '');
    const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(base, relative));
    if (stat.type === vscode.FileType.File && actionData.params.recursive)
        return actionValidationFailure(`Cannot delete file ${actionData.params.path} with recursive.`, ACTION_FAIL_NOTES.targetedFile + ', but recursive was true');
    else if (stat.type === vscode.FileType.Directory && !actionData.params.recursive)
        return actionValidationFailure(`Cannot delete directory ${actionData.params.path} without recursive.`, ACTION_FAIL_NOTES.targetedFolder + ', but recursive was false');

    return actionValidationAccept();
}

async function neuroSafeRenameValidation(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    let check = await validatePath(actionData.params.oldPath, true, 'directory');
    if (!check.success) {
        check.historyNote = check.historyNote!.replace('Targeted', 'Old').replace('targeted', 'old');
        return check;
    };
    check = await validatePath(actionData.params.newPath, false, 'directory');
    if (!check.success) {
        check.historyNote = check.historyNote!.replace('Targeted', 'New').replace('targeted', 'new');
        return check;
    };

    return actionValidationAccept();
}

/**
 * Validate if the file is a binary file.
 * Always fails for folders.
 * @param actionData The action data.
 * @returns The validation result.
 */
async function binaryFileValidation(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    const relativePath = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri();

    if (!workspaceUri)
        return actionValidationFailure('You are not in a workspace.', ACTION_FAIL_NOTES.noWorkspace);

    const absolutePath = normalizePath(workspaceUri.fsPath + '/' + relativePath.replace(/^\/|\/$/g, ''));
    const uri = workspaceUri.with({ path: absolutePath });

    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        return actionValidationFailure('Specified file does not exist.', ACTION_FAIL_NOTES.doesntExist.replace('directory', 'file'));
    }

    const file = await vscode.workspace.fs.readFile(uri);
    if (await isBinary(file)) {
        return actionValidationFailure('You cannot open a binary file.', ACTION_FAIL_NOTES.binaryFile);
    }
    return actionValidationAccept();
}

/**
 * Validates if the targeted file is a file.
 * @returns The validation result.
 */
async function validateIsAFile(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    const filePath = actionData.params?.filePath;
    if (!filePath)
        return actionValidationRetry('No file path specified.', ACTION_FAIL_NOTES.noFilePath);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
        return actionValidationFailure('You are not in an open workspace.', ACTION_FAIL_NOTES.noWorkspace);

    const normalizedPath = normalizePath(filePath).replace(/^\/|\/$/g, '');
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length === 0)
        return actionValidationRetry('No file path specified.', ACTION_FAIL_NOTES.noFilePath);
    const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, ...segments);

    try {
        const stat = await vscode.workspace.fs.stat(fullPath);
        const isDirectory = (stat.type & vscode.FileType.Directory) === vscode.FileType.Directory;
        const isFile = (stat.type & vscode.FileType.File) === vscode.FileType.File;

        if (isDirectory)
            return actionValidationFailure(`${filePath} is a directory, not a file.`, ACTION_FAIL_NOTES.targetedFolder);
        if (!isFile)
            return actionValidationFailure(`${filePath} is not a file.`, ACTION_FAIL_NOTES.targetedFolder);
    } catch (erm: unknown) {
        if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound')
            return actionValidationFailure(`${filePath} does not exist.`, ACTION_FAIL_NOTES.doesntExist);
        throw erm;
    }

    return actionValidationAccept();
}

/**
 * Creates a validation function that ensures the path provided is not trying to treat a file as a folder.
 * @param key The key in params that contains the path to validate.
 */
function validateNotTreatingFileAsFolder(key: string) {
    return async ({ data: actionData }: RCEContext): Promise<ActionValidationResult> => {
        const path = getProperty(actionData.params, key) as string | undefined;

        if (path === undefined) {
            // If it is undefined it is not required
            return actionValidationAccept();
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder)
            return actionValidationFailure('You are not in an open workspace.', ACTION_FAIL_NOTES.noWorkspace);
        const normalizedPath = normalizePath(path).replace(/^\/|\/$/g, '');
        const segments = normalizedPath.split('/').filter(Boolean);
        if (segments.length === 0)
            return actionValidationRetry('No path specified.', ACTION_FAIL_NOTES.noFilePath);
        for (const segment of segments.slice(0, -1)) {
            const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, ...segments.slice(0, segments.indexOf(segment) + 1));
            try {
                const stat = await vscode.workspace.fs.stat(fullPath);
                const isDirectory = (stat.type & vscode.FileType.Directory) === vscode.FileType.Directory;
                if (!isDirectory) {
                    return actionValidationFailure(
                        `${segments.slice(0, segments.indexOf(segment) + 1).join('/')} is not a directory.`,
                        segments.slice(0, segments.indexOf(segment) + 1).join('/') + ' is a file, but was specified as a directory.',
                    );
                }
            } catch {
                break; // If it doesn't exist, it can't be a file, so we can stop checking
            }
        }
        return actionValidationAccept();
    };
}

function validateIllegalCharacters(key: string, illegalChars: string[]) {
    return ({ data: actionData }: RCEContext): ActionValidationResult => {
        const prop = getProperty(actionData.params, key) as string | undefined;
        if (prop === undefined) {
            return actionValidationAccept();
        }
        if (illegalChars.some((char) => prop.includes(char))) {
            return actionValidationFailure(
                `${key} contains illegal characters: ${illegalChars.filter((char) => prop.includes(char)).join(' ')}`,
                'Illegal characters in property.',
            );
        }
        return actionValidationAccept();
    };
}

const commonFileEvents: ((context: RCEContext) => RCECancelEvent | null)[] = [
    (context: RCEContext) => targetedFileCreatedEvent(context.data.params?.filePath),
    (context: RCEContext) => targetedFileDeletedEvent(context.data.params?.filePath),
];

export const fileActions = {
    list_files_and_folders: {
        name: 'list_files_and_folders',
        description: 'Get a list of files in the workspace. Will not return subdirectories by default, use `recursive` to do so.',
        schema: {
            type: 'object',
            properties: {
                folder: { type: 'string', description: 'If you want to view only a subfolder\'s contents, specify a subfolder in this property. If not specified, defaults to the workspace root.' },
                recursive: { type: 'boolean', description: 'Set this to `true` if you want to view all subfolders\' contents as well.' },
            },
            additionalProperties: false,
        },
        category: CATEGORY_FILE_ACTIONS,
        handler: handleGetWorkspaceFiles,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri) {
                return { dispose: () => {} };
            }

            const folder = context.data.params?.folder;
            const recursive = context.data.params?.recursive ?? false;
            const folderUri = folder
                ? vscode.Uri.joinPath(workspaceUri, folder)
                : workspaceUri;

            let disposed = false;
            const disposables: vscode.Disposable[] = [];

            if (!recursive) {
                // Get all items in the folder and mark them individually
                vscode.workspace.fs.readDirectory(folderUri).then(
                    (items) => {
                        if (disposed) return; // Prevent marking after dispose
                        const uris = items
                            .map(([name, _type]) => vscode.Uri.joinPath(folderUri, name))
                            .filter(uri => isPathNeuroSafe(uri.fsPath));
                        disposables.push(filePreviewProvider.mark(uris, 'see this file\'s existence', false, true));
                        // Also mark the directory itself
                        disposables.push(filePreviewProvider.mark([folderUri], 'list this directory', false, true));
                    },
                    () => {
                        if (disposed) return; // Prevent marking after dispose
                        // If we can't read the directory, just mark the folder itself
                        disposables.push(filePreviewProvider.mark([folderUri], 'see this folder\'s existence', false, true));
                    },
                );
            } else {
                // Mark the folder with children propagation enabled
                disposables.push(filePreviewProvider.mark([folderUri], 'list this', false, false));
            }

            return {
                dispose: () => {
                    disposed = true;
                    for (const d of disposables) {
                        d.dispose();
                    }
                },
            };
        },
        validators: {
            sync: [async (context: RCEContext) => {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder === undefined)
                    return actionValidationFailure('No open workspace to get files from.');
                let folder = context.data.params?.folder as string;
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
        },
        cancelEvents: [
            (context: RCEContext) => {
                if (context.data.params?.folder) {
                    return targetedFileDeletedEvent(stripTailSlashes(context.data.params.folder));
                } else return null;
            },
        ],
        promptGenerator: (context: RCEContext) => `${context.data.params?.recursive ? 'recursively get' : 'get'} a list of files in ${context.data.params?.folder ? `"${stripTailSlashes(context.data.params.folder)}"` : 'the workspace'}.`,
    },
    switch_files: {
        name: 'switch_files',
        description: 'Switch to a different file in the workspace. You cannot open a binary file directly.',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the file.', examples: ['src/index.ts', './main.py'] },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        handler: handleOpenFile,
        cancelEvents: [
            (context: RCEContext) => targetedFileDeletedEvent(context.data.params?.filePath),
        ],
        validators: {
            sync: [neuroSafeValidation(true), validateIsAFile, binaryFileValidation],
        },
        promptGenerator: (context: RCEContext) => `open the file "${context.data.params?.filePath}".`,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.filePath) {
                return { dispose: () => { } };
            }
            const fileUri = vscode.Uri.joinPath(workspaceUri, context.data.params.filePath);
            return filePreviewProvider.mark([fileUri], 'open this file');
        },
    },
    read_file: {
        name: 'read_file',
        description: 'Read a file\'s contents without opening it.' +
            'If filePath is not specified, reads the currently open file. ',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the file. If omitted, reads the currently open file.', examples: ['./index.html', 'style.css', 'src/main.js'] },
            },
            additionalProperties: false,
        },
        handler: handleReadFile,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.filePath) {
                return { dispose: () => { } };
            }
            const fileUri = vscode.Uri.joinPath(workspaceUri, context.data.params.filePath);
            return filePreviewProvider.mark([fileUri], 'read this file');
        },
        cancelEvents: [
            (context: RCEContext) => {
                if (!context.data.params?.filePath) {
                    // For current file, cancel on document change
                    return new RCECancelEvent({
                        reason: 'the active document was changed.',
                        events: [
                            [vscode.workspace.onDidChangeTextDocument, null],
                        ],
                    });
                }
                // it looks more readable this way okay
                return null;
            },
            (context: RCEContext) => context.data.params?.filePath ? targetedFileDeletedEvent(context.data.params.filePath) : null,
        ],
        validators: {
            sync: [
                async (context: RCEContext) => {
                    // Some sub-validators don't understand an empty filePath and will crash unless passed a modified context
                    // Copy to avoid mutation (there shouldn't be any recursive properties possible on context.data)
                    const contextCopy = Object.assign({}, context);     // Shallow copy
                    const actionData = structuredClone(context.data);   // Deep copy
                    contextCopy.data = actionData;

                    const workspaceUri = getWorkspaceUri();
                    if (!workspaceUri) {
                        return actionValidationFailure('You are not in a workspace.', 'Not in a workspace.');
                    }

                    // Default to currently open file if filePath not provided
                    if (!actionData.params.filePath || actionData.params.filePath === '') {
                        const document = vscode.window.activeTextEditor?.document;
                        if (!document) {
                            return actionValidationFailure('File path left empty and you are not in an active file to edit.', 'Not in editable file.');
                        }

                        actionData.params.filePath = vscode.workspace.asRelativePath(document.uri, false);
                    } else {
                        // Normalize user-provided paths using VS Code's relative path resolver
                        const normalizedUri = vscode.Uri.joinPath(workspaceUri, actionData.params.filePath);
                        actionData.params.filePath = vscode.workspace.asRelativePath(normalizedUri, false);
                    }

                    // Run all validators with the resolved filePath
                    const neuroSafeResult = await neuroSafeValidation(true)(context);
                    if (!neuroSafeResult.success) return neuroSafeResult;

                    const binaryResult = await binaryFileValidation(contextCopy);
                    if (!binaryResult.success) return binaryResult;

                    const fileResult = await validateIsAFile(contextCopy);
                    if (!fileResult.success) return fileResult;

                    return actionValidationAccept();
                },
            ],
        },
        promptGenerator: (context: RCEContext) => {
            if (context.data.params?.filePath) {
                return `read the file "${context.data.params.filePath}" (without opening it).`;
            }
            return 'get the current file\'s contents.';
        },
    },
    create_file: {
        name: 'create_file',
        description: 'Create a new file at the specified path. The path should include the name of the new file.',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The relative path to the new file.', examples: ['./newfile.py', 'src/module.js'] },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        handler: handleCreateFile,
        cancelEvents: commonFileEvents,
        validators: {
            sync: [
                neuroSafeValidation(),
                validateNotTreatingFileAsFolder('filePath'),
                validateIllegalCharacters('filePath', '<>:"|?*'.split('')),
            ],
        },
        promptGenerator: (context: RCEContext) => `create the file "${context.data.params?.filePath}".`,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.filePath) {
                return { dispose: () => { } };
            }
            const fileUri = vscode.Uri.joinPath(workspaceUri, context.data.params.filePath);
            return filePreviewProvider.mark([fileUri], 'create this file');
        },
    },
    create_folder: {
        name: 'create_folder',
        description: 'Create a new folder at the specified path. The path should include the name of the new folder.',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                folderPath: { type: 'string', description: 'The relative path to the folder.', examples: ['./src', 'public'] },
            },
            required: ['folderPath'],
            additionalProperties: false,
        },
        handler: handleCreateFolder,
        cancelEvents: [
            (context: RCEContext) => targetedFileCreatedEvent(context.data.params?.folderPath),
        ],
        validators: {
            sync: [
                neuroSafeValidation(),
                validateNotTreatingFileAsFolder('folderPath'),
                validateIllegalCharacters('folderPath', '<>:"|?*'.split('')),
            ],
        },
        promptGenerator: (context: RCEContext) => `create the folder "${context.data.params?.folderPath}".`,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.folderPath) {
                return { dispose: () => { } };
            }
            const folderUri = vscode.Uri.joinPath(workspaceUri, context.data.params.folderPath);
            return filePreviewProvider.mark([folderUri], 'create this folder');
        },
    },
    rename_file_or_folder: {
        name: 'rename_file_or_folder',
        description: 'Rename a file or folder. Specify the full relative path for both the old and new names.',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                oldPath: { type: 'string', description: 'The relative path to the old directory.', examples: ['src', './main.py'] },
                newPath: { type: 'string', description: 'The relative path to the new directory.', examples: ['wip', './new.py'] },
            },
            required: ['oldPath', 'newPath'],
            additionalProperties: false,
        },
        handler: handleRenameFileOrFolder,
        cancelEvents: [
            (context: RCEContext) => targetedFileCreatedEvent(context.data.params?.newPath),
            (context: RCEContext) => targetedFileDeletedEvent(context.data.params?.oldPath),
        ],
        validators: {
            sync: [
                neuroSafeRenameValidation,
                validateNotTreatingFileAsFolder('newPath'),
                validateIllegalCharacters('newPath', '<>:"|?*'.split('')),
            ],
        },
        promptGenerator: (context: RCEContext) => `rename "${context.data.params?.oldPath}" to "${context.data.params?.newPath}".`,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.oldPath || !context.data.params?.newPath) {
                return { dispose: () => { } };
            }
            const oldUri = vscode.Uri.joinPath(workspaceUri, context.data.params.oldPath);
            const newUri = vscode.Uri.joinPath(workspaceUri, context.data.params.newPath);
            return filePreviewProvider.mark([oldUri, newUri], 'rename this', true);
        },
    },
    delete_file_or_folder: {
        name: 'delete_file_or_folder',
        description: 'Delete a file or folder. If you want to delete a folder, set the "recursive" parameter to true.',
        category: CATEGORY_FILE_ACTIONS,
        schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'The relative path to the file/folder to delete.', examples: ['src/index.ts', './utils'] },
                recursive: { type: 'boolean', description: 'If set to true, enables you to delete a folder and all its sub-folders.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
        handler: handleDeleteFileOrFolder,
        cancelEvents: [
            (context: RCEContext) => targetedFileDeletedEvent(context.data.params?.path),
        ],
        validators: {
            sync: [neuroSafeDeleteValidation],
        },
        promptGenerator: (context: RCEContext) => `delete "${context.data.params?.path}".`,
        preview: (context: RCEContext) => {
            const workspaceUri = getWorkspaceUri();
            if (!workspaceUri || !context.data.params?.path) {
                return { dispose: () => { } };
            }
            const pathUri = vscode.Uri.joinPath(workspaceUri, context.data.params.path);
            return filePreviewProvider.mark([pathUri], 'delete this', true);
        },
    },
} satisfies Record<string, RCEAction>;

export function addFileActions() {
    addActions([
        fileActions.list_files_and_folders,
        fileActions.switch_files,
        fileActions.read_file,
        fileActions.create_file,
        fileActions.create_folder,
        fileActions.rename_file_or_folder,
        fileActions.delete_file_or_folder,
    ]);
}

export function handleCreateFile(context: RCEContext): RCEHandlerReturns {
    const { data: actionData, updateStatus } = context;
    const relativePathParam = actionData.params.filePath;
    const relativePath = normalizePath(relativePathParam).replace(/^\//, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if (!isPathNeuroSafe(absolutePath)) {
        return actionHandlerFailure(`You are not allowed to access ${relativePath}`, ACTION_FAIL_NOTES.noAccess.replace('directory', 'file'));
    }

    return checkAndOpenFileAsync(absolutePath, relativePath);

    // Function to avoid pyramid of doom
    async function checkAndOpenFileAsync(absolutePath: string, relativePath: string) {
        const fileUri = getWorkspaceUri()!.with({ path: absolutePath });

        // Check if the file already exists
        try {
            await vscode.workspace.fs.stat(fileUri);
            // If no error is thrown, the file already exists
            return actionHandlerFailure(`File ${relativePath} already exists`, ACTION_FAIL_NOTES.alreadyExists.replace('path', 'file'));
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('create_file', erm);
                return actionHandlerFailure(`Failed to create file ${relativePath}`, EXCEPTION_THROWN_STRING);
            };
            /* else, file does not exist, continue */
        }

        // Create the file
        try {
            updateStatus('pending', 'Creating file...');
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
        } catch (erm: unknown) {
            notifyOnCaughtException('create_file', erm);
            return actionHandlerFailure(`Failed to create file ${relativePath}`, EXCEPTION_THROWN_STRING);
        }

        logOutput('INFO', `Created file ${relativePath}`);

        // Open the file if Neuro has permission for open_file
        if (getPermissionLevel(fileActions.switch_files.name) !== PermissionLevel.AUTOPILOT) {
            return actionHandlerSuccess(`Created file ${relativePath}`, 'File created');
        }

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
            return actionHandlerSuccess(`Created and opened file ${relativePath}`, 'File created and opened');
        } catch (erm: unknown) {
            logOutput('ERROR', `Failed to open new file ${relativePath}: ${erm}`);
            return actionHandlerSuccess(`Created file ${relativePath} but failed to open`, 'File created but failed to open');
        }
    }
}

export function handleCreateFolder(context: RCEContext): RCEHandlerReturns {
    const { data: actionData, updateStatus } = context;
    const relativePathParam = actionData.params.folderPath;
    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if (!isPathNeuroSafe(absolutePath)) {
        return actionHandlerFailure(`You are not allowed to access ${relativePath}`, ACTION_FAIL_NOTES.noAccess.replace('directory', 'folder'));
    }

    return checkAndCreateFolderAsync(absolutePath, relativePath);

    // Function to avoid pyramid of doom
    async function checkAndCreateFolderAsync(absolutePath: string, relativePath: string) {
        const base = vscode.workspace.workspaceFolders![0].uri;
        const folderUri = vscode.Uri.joinPath(base, relativePath);

        // Check if the folder already exists
        try {
            await vscode.workspace.fs.stat(folderUri);
            // If no error is thrown, the folder already exists
            return actionHandlerFailure(`Folder ${relativePath} already exists`, ACTION_FAIL_NOTES.alreadyExists.replace('path', 'folder'));
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('create_folder', erm);
                return actionHandlerFailure(`Failed to create folder ${relativePath}`, EXCEPTION_THROWN_STRING);
            }
            /* else, folder does not exist, continue */
        }

        // Create the folder
        try {
            updateStatus('pending', 'Creating folder...');
            await vscode.workspace.fs.createDirectory(folderUri);
            logOutput('INFO', `Created folder ${relativePath}`);
            return actionHandlerSuccess(`Created folder ${relativePath}`, 'Folder created');
        } catch (erm: unknown) {
            notifyOnCaughtException('create_folder', erm);
            return actionHandlerFailure(`Failed to create folder ${relativePath}`, EXCEPTION_THROWN_STRING);
        }
    }
}

export function handleRenameFileOrFolder(context: RCEContext): RCEHandlerReturns {
    const { data: actionData, updateStatus } = context;
    const oldRelativePathParam = actionData.params.oldPath;
    const newRelativePathParam = actionData.params.newPath;

    const base = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!base) {
        return actionHandlerFailure('No workspace folder open', 'No workspace folder open');
    }

    const oldRelativePath = normalizePath(oldRelativePathParam).replace(/^\/|\/$/g, '');
    const newRelativePath = normalizePath(newRelativePathParam).replace(/^\/|\/$/g, '');
    return checkAndRenameAsync(oldRelativePath, newRelativePath);

    // Function to avoid pyramid of doom
    async function checkAndRenameAsync(oldRelativePath: string, newRelativePath: string) {
        assert(base, 'Base URI should have already been checked for!');

        // Use joinPath so this works in both desktop (file://) and web/virtual FS (e.g. vscode-test-web://mount/)
        const oldUri = vscode.Uri.joinPath(base, oldRelativePath);
        const newUri = vscode.Uri.joinPath(base, newRelativePath);

        // Check if the old path doesn't exist
        try {
            await vscode.workspace.fs.stat(oldUri);
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') {
                return actionHandlerFailure(`${oldRelativePath} doesn't exist`, ACTION_FAIL_NOTES.doesntExist.replace('Targeted', 'Old'));
            }
            else {
                notifyOnCaughtException('rename_file_or_folder', erm);
                return actionHandlerFailure(`Failed to rename ${oldRelativePath}`, EXCEPTION_THROWN_STRING);
            };
        }

        // Check if the new path already exists
        try {
            await vscode.workspace.fs.stat(newUri);
            // If no error is thrown, the new path already exists
            return actionHandlerFailure(`${newRelativePath} already exists`, ACTION_FAIL_NOTES.alreadyExists.replace('Targeted', 'New'));
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code !== 'FileNotFound') {
                notifyOnCaughtException('rename_file_or_folder', erm);
                return actionHandlerFailure(`Failed to rename ${oldRelativePath}`, EXCEPTION_THROWN_STRING);
            };
            /* New path does not exist, continue */
        }

        // Rename the file/folder
        try {
            updateStatus('pending', 'Renaming paths...');
            await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
        } catch (erm: unknown) {
            notifyOnCaughtException('rename_file_or_folder', erm);
            return actionHandlerFailure(`Failed to rename ${oldRelativePath} to ${newRelativePath}`, EXCEPTION_THROWN_STRING);
        }

        logOutput('INFO', `Renamed ${oldRelativePath} to ${newRelativePath}`);
        return actionHandlerSuccess(`Renamed ${oldRelativePath} to ${newRelativePath}`, 'Renamed successfully');
    }
}

export function handleDeleteFileOrFolder(context: RCEContext): RCEHandlerReturns {
    const { data: actionData, updateStatus } = context;
    const relativePathParam = actionData.params.path;
    const recursive = actionData.params.recursive ?? false;

    const base = vscode.workspace.workspaceFolders![0].uri;

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;

    return checkAndDeleteAsync(absolutePath, relativePath, recursive);

    // Function to avoid pyramid of doom
    async function checkAndDeleteAsync(_absolutePath: string, relativePath: string, recursive: boolean) {
        const uri = vscode.Uri.joinPath(base, relativePath);
        let stat: vscode.FileStat;

        // Check if the path exists
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') {
                return actionHandlerFailure(`${relativePath} does not exist`, ACTION_FAIL_NOTES.doesntExist);
            } else {
                notifyOnCaughtException('delete_file_or_folder', erm);
                return actionHandlerFailure(`Failed to delete ${relativePath}`, EXCEPTION_THROWN_STRING);
            }
        }

        // Check for correct recursive parameter
        if (stat.type === vscode.FileType.Directory && !recursive) {
            return actionHandlerFailure(`${relativePath} requires recursive parameter because it is a directory`, 'Recursive parameter required for directory');
        }

        // Delete the file/folder
        try {
            const useTrash = base.scheme === 'file';
            updateStatus('pending', `Deleting targeted ${recursive ? 'folder' : 'file'}`);
            await vscode.workspace.fs.delete(uri, { recursive, useTrash });
        } catch (erm: unknown) {
            logOutput('ERROR', `Failed to delete ${relativePath}: ${erm}`);
            return actionHandlerFailure(`Failed to delete ${relativePath}`, EXCEPTION_THROWN_STRING);
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
        return actionHandlerSuccess(`Deleted ${relativePath}`, stat.type === vscode.FileType.Directory ? 'Folder deleted' : 'File deleted');
    }
}

export function handleGetWorkspaceFiles(context: RCEContext): RCEHandlerReturns {
    const { data: actionData, updateStatus } = context;
    const workspaceFolder = vscode.workspace.workspaceFolders![0];

    // Start tracking execution
    updateStatus('pending', 'Listing workspace files...');

    let folderUri = workspaceFolder.uri;
    const folder = actionData.params?.folder;
    if (folder) {
        const relativeFolderPath = normalizePath(stripTailSlashes(folder)).replace(/^\/|\/$/g, '');
        folderUri = vscode.Uri.joinPath(folderUri, ...relativeFolderPath.split('/').filter(Boolean));
    }
    return listWorkspace(folderUri).then(
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
            return actionHandlerSuccess(`Files in ${displayFolder}:\n\n${paths.join('\n')}`, `Listed ${paths.length} files`);
        },
        (erm: unknown) => {
            logOutput('ERROR', `Could not list workspace files: ${String(erm)}`);
            return actionHandlerFailure('Unable to list workspace files', PROMISE_REJECTION_STRING);
        },
    );

    async function listWorkspace(uri: vscode.Uri): Promise<[vscode.Uri, vscode.FileType][]> {
        const entries: [string, vscode.FileType][] = await vscode.workspace.fs.readDirectory(uri);
        const uriEntries: [vscode.Uri, vscode.FileType][] = entries.map(([name, type]) => [vscode.Uri.joinPath(uri, name), type]);

        const result: [vscode.Uri, vscode.FileType][] = [];
        for (const [childUri, fileType] of uriEntries) {
            if (isPathNeuroSafe(childUri.fsPath)) {
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

export function handleOpenFile(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    const relativePath = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri()!;
    const relative = normalizePath(relativePath).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relative;
    if (!isPathNeuroSafe(absolutePath)) {
        return actionHandlerFailure(`You are not allowed to access ${relativePath}`, ACTION_FAIL_NOTES.noAccess);
    }

    const fileUri = vscode.Uri.joinPath(workspaceUri, relative);

    return openFileAsync();

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
            return actionHandlerSuccess(`Opened file ${relativePath}`, 'File opened');
        } catch (erm: unknown) {
            if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') {
                return actionHandlerFailure(`File ${relativePath} not found`, ACTION_FAIL_NOTES.doesntExist);
            } else {
                notifyOnCaughtException('open_file', erm);
                return actionHandlerFailure(`Failed to open file ${relativePath}`, EXCEPTION_THROWN_STRING);
            }
        }
    }
}

export function handleReadFile(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return actionHandlerFailure('No active text editor.', 'No active text editor.');
    }
    // If no filePath provided, read current file
    if (!actionData.params.filePath || actionData.params.filePath === '' || vscode.workspace.asRelativePath(editor.document.uri) === vscode.workspace.asRelativePath(vscode.Uri.joinPath(getWorkspaceUri()!, actionData.params.filePath))) {
        const document = editor.document;
        const fileName = simpleFileName(document.fileName);
        const cursor = getVirtualCursor()!;

        if (!isPathNeuroSafe(document.fileName)) {
            return actionHandlerFailure(`You are not allowed to access ${fileName}`, 'Access denied');
        }

        // Manually construct context to include entire file
        const positionContext: NeuroPositionContext = {
            contextBefore: filterFileContents(document.getText(new vscode.Range(new vscode.Position(0, 0), cursor))),
            contextAfter: filterFileContents(document.getText(new vscode.Range(cursor, document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end))),
            startLine: 0,
            endLine: document.lineCount - 1,
            totalLines: document.lineCount,
            cursorDefined: true,
        };

        return actionHandlerSuccess(`Contents of the file ${fileName}:\n\n${formatContext(positionContext)}`, 'File read');
    }

    // Original read_file logic for specific file
    const file = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri()!;
    const absolute = normalizePath(workspaceUri.fsPath + '/' + file.replace(/^\/|\/$/g, ''));
    if (!isPathNeuroSafe(absolute)) {
        return actionHandlerFailure(`You are not allowed to access ${file}`, 'Access denied');
    }
    const fileAsUri = workspaceUri.with({ path: absolute });
    try {
        return vscode.workspace.fs.readFile(fileAsUri).then(
            (data: Uint8Array) => {
                const decodedContent = new TextDecoder('utf-8').decode(data);
                const fence = getFence(decodedContent);
                return actionHandlerSuccess(`Contents of the file ${file}:\n\n${fence}\n${decodedContent}\n${fence}`, 'File contents sent');
            },
            (erm: unknown) => {
                logOutput('ERROR', `Couldn't read file ${absolute}: ${erm}`);
                return actionHandlerFailure(`Couldn't read file ${file}`, PROMISE_REJECTION_STRING);
            },
        );
    } catch (erm: unknown) {
        notifyOnCaughtException('read_file', erm);
        return actionHandlerFailure(`Unable to read file ${file}`, EXCEPTION_THROWN_STRING);
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

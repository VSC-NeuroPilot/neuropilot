import * as vscode from 'vscode';

import { EXCEPTION_THROWN_STRING, NEURO, PROMISE_REJECTION_STRING } from '@/constants';
import { getProperty, getWorkspacePath, getWorkspaceUri, isPathNeuroSafe, logOutput, normalizePath, notifyOnCaughtException, stripTailSlashes } from '@/utils/misc';
import { RCEAction, actionValidationFailure, actionValidationAccept, ActionValidationResult, actionValidationRetry, RCEHandlerReturns, actionHandlerSuccess, actionHandlerFailure } from '@/utils/neuro_client';
import { PermissionLevel, getPermissionLevel } from '@/config';
import { targetedFileCreatedEvent, targetedFileDeletedEvent } from '@events/files';
import { RCECancelEvent } from '@events/utils';
import { addActions } from './rce';
import { RCEContext } from '@ctx/rce';
import { filePreviewProvider } from '@/previews/files';
import assert from 'node:assert';
import { commonCancelEvents, checkCurrentFile, CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT, CONTEXT_NO_ACCESS, STATUS_NO_ACCESS, ACTION_FAIL_NOTES, validatePath, neuroSafeValidation, getUriExistence, validateIsAFile } from './utils/action_components';
import { readFileActions } from './read_files';

export const CATEGORY_FILE_ACTIONS = 'File System';

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
                return { dispose: () => { } };
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
            async: [async (context: RCEContext) => {
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
            sync: [validateIllegalCharacters('filePath', '<>:"|?*'.split(''))],
            async: [
                neuroSafeValidation(),
                validateNotTreatingFileAsFolder('filePath'),
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
            sync: [validateIllegalCharacters('folderPath', '<>:"|?*'.split(''))],
            async: [
                neuroSafeValidation(),
                validateNotTreatingFileAsFolder('folderPath'),
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
            sync: [validateIllegalCharacters('newPath', '<>:"|?*'.split(''))],
            async: [
                neuroSafeRenameValidation,
                validateNotTreatingFileAsFolder('newPath'),
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
            async: [neuroSafeDeleteValidation],
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
    save: {
        name: 'save',
        description: 'Manually save the currently open document.',
        category: CATEGORY_FILE_ACTIONS,
        handler: handleSave,
        cancelEvents: [
            ...commonCancelEvents,
            () => new RCECancelEvent({
                reason: 'the active document was saved.',
                events: [
                    [vscode.workspace.onDidSaveTextDocument, null],
                ],
            }),
        ],
        validators: {
            sync: [checkCurrentFile],
        },
        promptGenerator: 'save.',
        registerCondition: () => vscode.workspace.getConfiguration('files').get<string>('autoSave') !== 'afterDelay',
    },
} satisfies Record<string, RCEAction>;

export function addFileActions() {
    addActions([
        fileActions.list_files_and_folders,
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
        if (getPermissionLevel(readFileActions.switch_files.name) !== PermissionLevel.AUTOPILOT) {
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

export function handleSave(): RCEHandlerReturns {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    NEURO.saving = true;
    logOutput('INFO', `${NEURO.currentController} is saving the current document.`);

    return document.save().then(
        (saved) => {
            if (saved) {
                logOutput('INFO', 'Document saved successfully.');
                NEURO.saving = false;
                return actionHandlerSuccess('Document saved successfully.', 'Document saved');
            } else {
                logOutput('WARNING', 'Document save returned false.');
                NEURO.saving = false;
                return actionHandlerFailure('Document did not save.', 'Document did not save');
            }
        },
        (erm: string) => {
            logOutput('ERROR', `Failed to save document: ${erm}`);
            NEURO.saving = false;
            return actionHandlerFailure('Failed to save document.', 'Failed to save');
        },
    );
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

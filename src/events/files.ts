import * as vscode from 'vscode';
import { RCECancelEvent } from './utils';
import { CONNECTION } from '../config';
import { getWorkspaceUri } from '@/utils';

/**
 * Wrapper event to check if a specific file is created.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileCreatedEvent(file: string) {
    return new RCECancelEvent<vscode.FileCreateEvent>({
        reason: `the file ${file} was created by ${CONNECTION.userName}.`,
        logReason: () => `the file "${file}" was created.`,
        events: [
            [vscode.workspace.onDidCreateFiles, (data) => {
                const workspaceUri = getWorkspaceUri();
                const fileUri = workspaceUri?.with({ path: workspaceUri.path + '/' + file });
                return data.files.some(f => f.fsPath === fileUri?.fsPath);
            }],
        ],
    });
}

/**
 * Wrapper event to check if a specific file is deleted.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileDeletedEvent(file: string) {
    return new RCECancelEvent<vscode.FileDeleteEvent>({
        reason: `the file ${file} was deleted by ${CONNECTION.userName}.`,
        logReason: () => `the file "${file}" was created.`,
        events: [
            [vscode.workspace.onDidDeleteFiles, (data) => {
                const workspaceUri = getWorkspaceUri();
                const fileUri = workspaceUri?.with({ path: workspaceUri.path + '/' + file });
                return data.files.some(f => f.fsPath === fileUri?.fsPath);
            }],
        ],
    });
}

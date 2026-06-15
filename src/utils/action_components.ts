import * as vscode from 'vscode';

import { RCEContext } from '@ctx/rce';
import { createCursorPositionChangedEvent } from '@events/cursor';
import { RCECancelEvent } from '@events/utils';
import { getProperty, isPathNeuroSafe, getVirtualCursor, indexFromPosition, getWorkspacePath, normalizePath, getWorkspaceUri, isBinary } from './misc';
import { ActionValidationResult, RCEAction, actionValidationAccept, actionValidationFailure, actionValidationRetry } from './neuro_client';
import { JSONSchema7 } from 'json-schema';

export const CONTEXT_NO_ACCESS = 'You do not have permission to access this file.';
export const CONTEXT_NO_ACTIVE_DOCUMENT = 'No active document to edit.';

// Common status messages for action tracking
export const STATUS_NO_ACTIVE_DOCUMENT = 'No active document';
export const STATUS_NO_ACCESS = 'No access to file';
// const STATUS_POSITION_OUT_OF_BOUNDS = 'Position out of bounds';
// const STATUS_LINE_RANGE_INVALID = 'Invalid line range';
export const STATUS_NO_MATCHES_FOUND = 'No matches found';

export type MatchOptions = 'firstInFile' | 'lastInFile' | 'firstAfterCursor' | 'lastBeforeCursor' | 'allInFile';
export const MATCH_OPTIONS: MatchOptions[] = ['firstInFile', 'lastInFile', 'firstAfterCursor', 'lastBeforeCursor', 'allInFile'] as const;
export const POSITION_SCHEMA: (Omit<RCEAction, 'schema'> & { schema: Omit<JSONSchema7, 'type'> & { type: 'object' } })['schema'] = {
    type: 'object',
    description: 'Position parameters if you want to move your cursor or use a location other than the current location.',
    properties: {
        line: { type: 'integer', description: 'The line number for the position to target.' },
        column: { type: 'integer', description: 'The column number for the position to target.' },
        type: { type: 'string', enum: ['relative', 'absolute'], description: 'Whether or not to use the position relative to your cursor or the absolute position in the file. Additionally, if set to "relative", line & column numbers are zero-based, else if set to "absolute", they are one-based.' },
    },
    additionalProperties: false,
    required: ['line', 'column', 'type'],
};
export const LINE_RANGE_SCHEMA: (Omit<RCEAction, 'schema'> & { schema: Omit<JSONSchema7, 'type'> & { type: 'object' } })['schema'] = {
    type: 'object',
    description: 'The line range to target.',
    properties: {
        startLine: { type: 'integer', minimum: 1, description: 'The one-based line number to start from.' },
        endLine: { type: 'integer', minimum: 1, description: 'The one-based line number to end at.' },
    },
    additionalProperties: false,
    required: ['startLine', 'endLine'],
};
export interface Position {
    line: number;
    column: number;
    type: 'relative' | 'absolute';
}
export interface LineRange {
    startLine: number;
    endLine: number;
}

export const cancelOnDidChangeTextDocument = () => new RCECancelEvent({
    reason: 'the active document was changed.',
    events: [
        [vscode.workspace.onDidChangeTextDocument, null],
    ],
});

export const cancelOnDidChangeActiveTextEditor = () => new RCECancelEvent({
    reason: 'you\'ve switched files.',
    events: [
        [vscode.window.onDidChangeActiveTextEditor, null],
    ],
});

export const commonCancelEvents: ((context: RCEContext) => RCECancelEvent)[] = [
    cancelOnDidChangeTextDocument,
    cancelOnDidChangeActiveTextEditor,
];

export const commonCancelEventsWithCursor: ((context: RCEContext) => RCECancelEvent)[] = [
    ...commonCancelEvents,
    createCursorPositionChangedEvent,
];

/**
 * Create a position validator for the specified path.
 * The validator checks if the position is within the bounds of the document.
 * @param path The path to the position object. For the root pass an empty string.
 * @returns A function that validates the position in the action data.
 */
export function createPositionValidator(path = '') {
    return (context: RCEContext): ActionValidationResult => {
        const actionData = context.data;
        const position = getProperty(actionData.params, path) as Position | undefined;

        // If position is undefined, it is not required by the schema (otherwise the schema check would fail first)
        if (position === undefined)
            return actionValidationAccept();

        const document = vscode.window.activeTextEditor?.document;
        if (document === undefined)
            return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
        if (!isPathNeuroSafe(document.fileName))
            return actionValidationFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);

        let { line, column } = position;
        const type = position.type;

        let basedLine: number; // The one-based line number

        if (type === 'relative') {
            const cursor = getVirtualCursor()!;
            line += cursor.line;
            column += cursor.character;

            basedLine = line + 1;
        } else { // type === 'absolute'
            basedLine = line;
            line -= 1;
            column -= 1;
        }

        // Additional checks for better feedback
        if (type === 'absolute' && (position.line === 0 || position.column === 0))
            return actionValidationRetry('Line and column numbers are one-based, so the first line and column are 1, not 0.');

        // Check if the line and column are in-bounds
        if (line >= document.lineCount || line < 0)
            return actionValidationRetry(`Line ${basedLine} is out of bounds, the last line of the document is ${document.lineCount}.`);
        if (column > document.lineAt(line).text.length || column < 0)
            return actionValidationRetry(`Column ${column + 1} is out of bounds, the last column of line ${basedLine} is ${document.lineAt(line).text.length + 1}.`);

        return actionValidationAccept();
    };
}

/**
 * Creates a line range validator for the specified path.
 * The validator checks that the `startLine` and `endLine` properties are valid and in-bounds.
 * @param path The path to the line range object. For the root pass an empty string.
 * @returns A function that validates the line range in the action data.
 */
export function createLineRangeValidator(path = '') {
    return (context: RCEContext) => {
        const actionData = context.data;
        const range = getProperty(actionData.params, path) as LineRange | undefined;

        // If it's undefined it's not required
        if (!range) return actionValidationAccept();

        const { startLine, endLine } = range;
        const document = vscode.window.activeTextEditor?.document;

        // Recheck if there is an active document, because it is later needed to check if the line range is out of bounds. This in case this validator is used on its own.
        if (!document) return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT);

        // Check line number validity
        if (startLine <= 0 || endLine <= 0) {
            return actionValidationRetry('Line numbers must be positive integers (1-based).');
        }

        if (startLine > endLine) {
            return actionValidationRetry(`Start line (${startLine}) cannot be greater than end line (${endLine}).`);
        }

        if (startLine > document.lineCount || endLine > document.lineCount) {
            return actionValidationRetry(`Line range ${startLine}-${endLine} is out of bounds. File has ${document.lineCount} lines.`);
        }

        return actionValidationAccept();
    };
}

/**
 * Create a generic string validator that checks type and character limits.
 * @param paramPaths Array of parameter paths to validate (e.g., ['text', 'content'])
 * @param maxLength Maximum character length (default: 100,000)
 * @returns A function that validates the specified string parameters
 */
export function createStringValidator(paramPaths: string[], maxLength = 100000) {
    return (context: RCEContext): ActionValidationResult => {
        const actionData = context.data;
        for (const path of paramPaths) {
            const value = getProperty(actionData.params, path);

            // Check if parameter exists and is a string
            if (value !== undefined && typeof value !== 'string') {
                return actionValidationRetry(`${path} must be a string.`);
            }

            // Check character limit if parameter exists
            if (value !== undefined && value.length > maxLength) {
                return actionValidationRetry(`${path} is too large, send less than ${maxLength.toLocaleString()} characters.`);
            }
        }

        return actionValidationAccept();
    };
}

/**
 * Creates a regex validator for the specified key and useKey.
 * @param key The key in the action parameters that contains the regex pattern to validate.
 * @param useKey The key in the action parameters that indicates whether the pattern is a regex or not. If the value at this key is false, the validator will skip validating the regex pattern and accept it as valid.
 * @returns A function that validates the regex pattern in the action data.
 */
export function validateRegex(key: string, useKey?: string) {
    return ({ data: actionData }: RCEContext): ActionValidationResult => {
        const find = getProperty(actionData.params, key) as string | undefined;
        const useRegex = useKey
            ? getProperty(actionData.params, useKey) ?? false
            : true;

        if (find === undefined) {
            // If it is undefined it is not required
            return actionValidationAccept();
        }
        if (typeof find !== 'string') {
            // The schema should already catch this, if it doesn't then it's a bug
            throw new Error(`Expected a string at params.${key}`);
        }
        if (!useRegex) return actionValidationAccept();
        try {
            // Try to construct a RegExp, if it doesn't throw an error then the regex is valid
            new RegExp(find);
            return actionValidationAccept();
        } catch (erm) {
            return actionValidationRetry(
                `The provided regex pattern in "${key}" is invalid: ${erm instanceof Error ? erm.message : String(erm)}`,
                'Invalid regex pattern provided.',
            );
        }
    };
}

/**
 * Find matches in the provided text and filter based on the match option.
 * @param regex The regular expression to search for.
 * @param text The text to search within.
 * @param cursorOffset The current cursor offset in the text.
 * @param match The match option from the {@link MATCH_OPTIONS} array.
 * @param lineRange The line range to limit results to. If not specified, defaults to the entire text.
 * @returns The matches found in the text based on the match option.
 */
export function findAndFilter(regex: RegExp, text: string, cursorOffset: number, match: string, lineRange: LineRange | undefined = undefined): RegExpExecArray[] {
    const matchIterator = text.matchAll(regex);
    let matches: RegExpStringIterator<RegExpExecArray> | RegExpExecArray[];

    if (lineRange) {
        const startPosition = new vscode.Position(lineRange.startLine - 1, 0);
        const endPosition = new vscode.Position(lineRange.endLine - 1, text.split(/\r?\n/g)[lineRange.endLine - 1].length);
        const minIndex = indexFromPosition(text, startPosition);
        const maxIndex = indexFromPosition(text, endPosition);
        matches = [];
        for (const m of matchIterator)
            matches.push(m);
        matches = matches.filter(m => m.index >= minIndex && m.index <= maxIndex);
    }
    else {
        matches = matchIterator;
    }

    let result: RegExpExecArray[] = [];

    switch (match) {
        case 'firstInFile':
            for (const m of matches)
                return [m];
            return [];

        case 'lastInFile':
            for (const m of matches)
                result = [m];
            return result;

        case 'firstAfterCursor':
            for (const m of matches)
                if (m.index >= cursorOffset)
                    return [m];
            return [];

        case 'lastBeforeCursor':
            for (const m of matches)
                if (m.index < cursorOffset)
                    result = [m];
                else break;
            return result;

        case 'allInFile':
            for (const m of matches)
                result.push(m);
            return result;

        default:
            throw new Error(`Invalid match option: ${match}`);
    }
}

export function checkCurrentFile(): ActionValidationResult {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return actionValidationFailure(CONTEXT_NO_ACCESS);

    return actionValidationAccept();
}

export const ACTION_FAIL_NOTES = {
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
export async function validatePath(path: string, shouldExist: boolean, pathType: string): Promise<ActionValidationResult> {
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

export async function getUriExistence(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch (erm: unknown) {
        if (erm instanceof vscode.FileSystemError && erm.code === 'FileNotFound') return false;
        else throw erm;
    }
}

export function neuroSafeValidation(shouldExist = false) {
    return async ({ data: actionData }: RCEContext): Promise<ActionValidationResult> => {
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

/**
 * Validate if the file is a binary file.
 * Always fails for folders.
 * @param actionData The action data.
 * @returns The validation result.
 */
export async function binaryFileValidation(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    const relativePath = actionData.params.filePath;

    const workspaceUri = getWorkspaceUri();

    if (!workspaceUri)
        return actionValidationFailure('You are not in a workspace.', ACTION_FAIL_NOTES.noWorkspace);

    const absolutePath = normalizePath(workspaceUri.fsPath + '/' + relativePath.replace(/^\/|\/$/g, ''));
    const uri = workspaceUri.with({ path: absolutePath });

    let stat: vscode.FileStat;
    try {
        stat = await vscode.workspace.fs.stat(uri);
    } catch {
        return actionValidationFailure('Specified file does not exist.', ACTION_FAIL_NOTES.doesntExist.replace('directory', 'file'));
    }

    // Fail if it is a directory
    if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
        return actionValidationFailure('Specified path is a directory, not a file.', ACTION_FAIL_NOTES.targetedFolder);
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
export async function validateIsAFile(context: RCEContext): Promise<ActionValidationResult> {
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

import * as vscode from 'vscode';

import { NEURO } from '@/constants';
import { DiffRangeType, escapeRegExp, getDiffRanges, getFence, getPositionContext, getProperty, getVirtualCursor, showDiffRanges, isPathNeuroSafe, logOutput, NeuroPositionContext, setVirtualCursor, simpleFileName, substituteMatch, clearDecorations, formatContext, filterFileContents, positionFromIndex, indexFromPosition } from '@/utils';
import { ActionData, actionValidationAccept, actionValidationFailure, ActionValidationResult, RCEAction, contextFailure, stripToActions, actionValidationRetry, contextNoAccess } from '@/neuro_client_helper';
import { PERMISSIONS, getPermissionLevel, CONFIG, isActionEnabled, CONNECTION } from '@/config';
import { createCursorPositionChangedEvent } from '@events/cursor';
import { RCECancelEvent } from '@events/utils';
import type { JSONSchema7 } from 'json-schema';

const CONTEXT_NO_ACCESS = 'You do not have permission to access this file.';
const CONTEXT_NO_ACTIVE_DOCUMENT = 'No active document to edit.';

type MatchOptions = 'firstInFile' | 'lastInFile' | 'firstAfterCursor' | 'lastBeforeCursor' | 'allInFile';
const MATCH_OPTIONS: MatchOptions[] = ['firstInFile', 'lastInFile', 'firstAfterCursor', 'lastBeforeCursor', 'allInFile'] as const;
const POSITION_SCHEMA: JSONSchema7 = {
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
interface Position {
    line: number;
    column: number;
    type: 'relative' | 'absolute';
}
const LINE_RANGE_SCHEMA: JSONSchema7 = {
    type: 'object',
    description: 'The line range to target.',
    properties: {
        startLine: { type: 'integer', minimum: 1, description: 'The one-based line number to start from.' },
        endLine: { type: 'integer', minimum: 1, description: 'The one-based line number to end at.' },
    },
    additionalProperties: false,
    required: ['startLine', 'endLine'],
};
interface LineRange {
    startLine: number;
    endLine: number;
}

/**
 * Create a generic string validator that checks type and character limits.
 * @param paramPaths Array of parameter paths to validate (e.g., ['text', 'content'])
 * @param maxLength Maximum character length (default: 100,000)
 * @returns A function that validates the specified string parameters
 */
function createStringValidator(paramPaths: string[], maxLength = 100000) {
    return (actionData: ActionData): ActionValidationResult => {
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
 * Create a position validator for the specified path.
 * The validator checks if the position is within the bounds of the document.
 * @param path The path to the position object. For the root pass an empty string.
 * @returns A function that validates the position in the action data.
 */
function createPositionValidator(path = '') {
    return (actionData: ActionData): ActionValidationResult => {
        const position = getProperty(actionData.params, path) as Position | undefined;

        // If position is undefined, it is not required by the schema (otherwise the schema check would fail first)
        if (position === undefined)
            return actionValidationAccept();

        const document = vscode.window.activeTextEditor?.document;
        if (document === undefined)
            return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
        if (!isPathNeuroSafe(document.fileName))
            return actionValidationFailure(CONTEXT_NO_ACCESS);

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

function checkCurrentFile(_actionData: ActionData): ActionValidationResult {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return actionValidationFailure(CONTEXT_NO_ACCESS);

    return actionValidationAccept();
}

/**
 * Creates a line range validator for the specified path.
 * The validator checks that the `startLine` and `endLine` properties are valid and in-bounds.
 * @param path The path to the line range object. For the root pass an empty string.
 * @returns A function that validates the line range in the action data.
 */
function createLineRangeValidator(path = '') {
    return (actionData: ActionData) => {
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

const cancelOnDidChangeTextDocument = () => new RCECancelEvent({
    reason: 'the active document was changed.',
    events: [
        [vscode.workspace.onDidChangeTextDocument, null],
    ],
});
const cancelOnDidChangeActiveTextEditor = () => new RCECancelEvent({
    reason: 'you\'ve switched files.',
    events: [
        [vscode.window.onDidChangeActiveTextEditor, null],
    ],
});

const commonCancelEvents: ((actionData: ActionData) => RCECancelEvent)[] = [
    cancelOnDidChangeTextDocument,
    cancelOnDidChangeActiveTextEditor,
];

const commonCancelEventsWithCursor: ((actionData: ActionData) => RCECancelEvent)[] = [
    ...commonCancelEvents,
    createCursorPositionChangedEvent,
];

export const editingActions = {
    place_cursor: {
        name: 'place_cursor',
        description: 'Place your cursor in the current file at the specified position. Line and column numbers are one-based for "absolute" and zero-based for "relative".',
        schema: {
            ...POSITION_SCHEMA,
            description: undefined,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handlePlaceCursor,
        validators: [checkCurrentFile, createPositionValidator()],
        cancelEvents: commonCancelEvents,
        promptGenerator: (actionData: ActionData) => `${actionData.params.type === 'absolute' ? 'place her cursor at' : 'move her cursor by'} (${actionData.params.line}:${actionData.params.column}).`,
    },
    get_cursor: {
        name: 'get_cursor',
        description: 'Get your current cursor position and the text surrounding it.',
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleGetCursor,
        validators: [checkCurrentFile],
        cancelEvents: commonCancelEventsWithCursor,
        promptGenerator: 'get her current cursor position and the text surrounding it.',
    },
    get_file_contents: {
        name: 'get_file_contents',
        description: 'Get the contents of the current file.',
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleGetContent,
        cancelEvents: [
            cancelOnDidChangeTextDocument,
        ],
        promptGenerator: 'get the current file\'s contents.',
        validators: [checkCurrentFile],
    },
    insert_text: {
        name: 'insert_text',
        description: 'Insert code at the specified position.'
            + ' Line and column numbers are one-based for "absolute" and zero-based for "relative".'
            + ' If no position is specified, your cursor\'s current position will be used.'
            + ' Remember to add indents after newlines where appropriate.'
            + ' After inserting, your cursor will be placed at the end of the inserted text.'
            + ' Also make sure you use new lines and indentation appropriately.',
        schema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text to insert.' },
                position: POSITION_SCHEMA,
            },
            required: ['text'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleInsertText,
        cancelEvents: [
            ...commonCancelEvents,
            (actionData: ActionData) => {
                return actionData.params.position ? null : createCursorPositionChangedEvent();
            },
        ],
        validators: [checkCurrentFile, createPositionValidator('position'), createStringValidator(['text'])],
        promptGenerator: (actionData: ActionData) => {
            const lineCount = actionData.params.text.trim().split('\n').length;
            let text = `insert ${lineCount} line${lineCount === 1 ? '' : 's'} of code`;
            if (actionData.params.position) {
                const position = actionData.params.position;
                switch (position.type) {
                    case 'relative':
                        text += `, (${position.line}:${position.column}) away from her cursor`;
                        break;
                    case 'absolute':
                        text += `, at line (${position.line}:${position.column})`;
                        break;
                }
            }
            text += '.';
            return text;
        },
    },
    insert_lines: {
        name: 'insert_lines',
        description: 'Insert code below a certain line.'
            + ' Defaults to your current cursor\'s location'
            + ' The insertUnder parameter is one-based, not zero-based.'
            + ' Remember to add indents after newlines where appropriate.'
            + ' Your cursor will be moved to the end of the inserted line.', // TODO: Clarify cursor stuff again
        schema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to insert',
                },
                insertUnder: {
                    type: 'integer',
                    minimum: 1,
                    description: 'The one-based line number to insert under.',
                },
            },
            additionalProperties: false,
            required: ['text'],
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleInsertLines,
        cancelEvents: [
            ...commonCancelEvents,
            (actionData: ActionData) => {
                return actionData.params.position ? null : createCursorPositionChangedEvent();
            },
        ],
        validators: [checkCurrentFile, createStringValidator(['lines'])],
        promptGenerator: (actionData: ActionData) => {
            const lines = actionData.params.text.trim().split('\n').length;
            const insertUnder = actionData.params.insertUnder;
            return `insert ${lines} line${lines !== 1 ? 's' : ''} of code below ${insertUnder ? `line ${insertUnder}` : 'her cursor'}.`;
        },
    },
    replace_text: {
        name: 'replace_text',
        description: 'Replace text in the active document.'
            + ' If you set "useRegex" to true, you can use a Regex in the "find" parameter and a substitution pattern in the "replaceWith" parameter.'
            + ' This will place your cursor at the end of the replaced text, unless you replaced multiple instances.',
        schema: {
            type: 'object',
            properties: {
                find: { type: 'string', description: 'The search text or RegEx pattern to search for text to replace.' },
                replaceWith: { type: 'string', description: 'The text to replace the search result(s) with. If using RegEx, you can use substitution patterns here.' },
                useRegex: { type: 'boolean', description: 'Whether or not the pattern(s) are RegEx patterns.' },
                match: { type: 'string', enum: MATCH_OPTIONS, description: 'The method to match text to replace.' },
                lineRange: LINE_RANGE_SCHEMA,
            },
            additionalProperties: false,
            required: ['find', 'replaceWith', 'match'],
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleReplaceText,
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: [checkCurrentFile, createStringValidator(['find', 'replaceWith']), createLineRangeValidator('lineRange')],
        promptGenerator: (actionData: ActionData) => {
            let text = 'replace ';
            const target = actionData.params.useRegex ? escapeRegExp(actionData.params.find) : actionData.params.find;
            switch (actionData.params.match as MatchOptions) {
                case 'allInFile':
                    text += 'all matches ';
                    break;
                case 'firstAfterCursor':
                    text += 'the first match (after her cursor) ';
                    break;
                case 'firstInFile':
                    text += 'the first match (in the file) ';
                    break;
                case 'lastBeforeCursor':
                    text += 'the last match (before her cursor) ';
                    break;
                case 'lastInFile':
                    text += 'the last match (in the file) ';
                    break;
            }
            text += `of "${target}" with "${actionData.params.replaceWith}"`;
            if (actionData.params.useRegex) {
                text += ' (using RegEx)';
            }
            if (actionData.params.lineRange) {
                const lineRange = actionData.params.lineRange;
                text += ` within lines ${lineRange.startLine}-${lineRange.endLine}`;
            }
            text += ' and move her cursor to the replaced text';
            if (actionData.params.match === 'allInFile') text += ' (unless there were multiple matches)';
            text += '.';
            return text;
        },
    },
    delete_text: {
        name: 'delete_text',
        description: 'Delete text in the active document.'
            + ' If you set "useRegex" to true, you can use a Regex in the "find" parameter.'
            + ' This will place your cursor where the deleted text was, unless you deleted multiple instances.'
            + ' Line numbers are one-based.',
        schema: {
            type: 'object',
            properties: {
                find: { type: 'string', description: 'The glob/RegEx pattern to search for text to delete.' },
                useRegex: { type: 'boolean', description: 'Whether or not the find pattern is a RegEx pattern.' },
                match: { type: 'string', enum: MATCH_OPTIONS, description: 'The method to match text to delete.' },
                lineRange: LINE_RANGE_SCHEMA,
            },
            required: ['find', 'match'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleDeleteText,
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: [checkCurrentFile, createStringValidator(['find']), createLineRangeValidator('lineRange')],
        promptGenerator: (actionData: ActionData) => {
            let text = 'delete ';
            const target = actionData.params.useRegex ? escapeRegExp(actionData.params.find) : actionData.params.find;
            switch (actionData.params.match as MatchOptions) {
                case 'allInFile':
                    text += 'all matches ';
                    break;
                case 'firstAfterCursor':
                    text += 'the first match (after her cursor) ';
                    break;
                case 'firstInFile':
                    text += 'the first match (in the file) ';
                    break;
                case 'lastBeforeCursor':
                    text += 'the last match (before her cursor) ';
                    break;
                case 'lastInFile':
                    text += 'the last match (in the file) ';
                    break;
                default:
                    text += 'unknown matches ';
                    break;
            }
            text += `of "${target}"`;
            if (actionData.params.useRegex) {
                text += ' (using RegEx)';
            }
            if (actionData.params.lineRange) {
                const lineRange = actionData.params.lineRange;
                text += ` within lines ${lineRange.startLine}-${lineRange.endLine}`;
            }
            text += ' and move her cursor to the deleted text';
            if (actionData.params.match === 'allInFile') text += ' (unless there were multiple matches)';
            text += '.';
            return text;
        },
    },
    find_text: {
        name: 'find_text',
        description: 'Find text in the active document.'
            + ' If you set "useRegex" to true, you can use a Regex in the "find" parameter.'
            + ' This will place your cursor directly before or after the found text (depending on "moveCursor"), unless you searched for multiple instances.'
            + ' Set "highlight" to true to highlight the found text, if you want to draw insert_turtle_here\'s or Chat\'s attention to it.'
            + ' If you search for multiple matches, the numbers at the start of each line are the one-based line numbers and not part of the code.',
        schema: {
            type: 'object',
            properties: {
                find: { type: 'string', description: 'The search text or RegEx pattern to search for text to replace.' },
                useRegex: { type: 'boolean', description: 'Whether or not the find pattern is a RegEx pattern.' },
                match: { type: 'string', enum: MATCH_OPTIONS, description: 'The method to find matching texts.' },
                lineRange: LINE_RANGE_SCHEMA,
                moveCursor: { type: 'string', enum: ['start', 'end'], description: 'If there is only one match, where should your cursor move relative to that match?' },
                highlight: { type: 'boolean', description: 'Set to true to highlight all matches.' },
            },
            required: ['find', 'match'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleFindText,
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: [checkCurrentFile, createStringValidator(['find']), createLineRangeValidator('lineRange')],
        promptGenerator: (actionData: ActionData) => {
            let text = 'find ';
            const target = actionData.params.useRegex ? escapeRegExp(actionData.params.find) : actionData.params.find;
            if (actionData.params.highlight) text += 'and highlight ';
            switch (actionData.params.match as MatchOptions) {
                case 'allInFile':
                    text += 'all matches ';
                    break;
                case 'firstAfterCursor':
                    text += 'the first match (after her cursor) ';
                    break;
                case 'firstInFile':
                    text += 'the first match (in the file) ';
                    break;
                case 'lastBeforeCursor':
                    text += 'the last match (before her cursor) ';
                    break;
                case 'lastInFile':
                    text += 'the last match (in the file) ';
                    break;
                default:
                    text += 'unknown matches ';
                    break;
            }
            text += `of "${target}"`;
            if (actionData.params.useRegex) {
                text += ' (using RegEx)';
            }
            if (actionData.params.lineRange) {
                const lineRange = actionData.params.lineRange;
                text += ` within lines ${lineRange.startLine}-${lineRange.endLine}`;
            }
            if (actionData.params.moveCursor) {
                text += ' and move her cursor to the result';
                if (actionData.params.match === 'allInFile') text += ' (unless there are multiple matches)';
            }
            text += '.';
            return text;
        },
    },
    undo: {
        name: 'undo',
        description: 'Undo the last change made to the active document.'
            + ' Where your cursor will be moved cannot be determined.' // It will move to the real cursor but thats kinda useless for her to know
            + ' If this doesn\'t work, tell insert_turtle_here to focus your VS Code window.',
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleUndo,
        cancelEvents: commonCancelEvents,
        validators: [checkCurrentFile],
        promptGenerator: 'undo the last action.',
    },
    save: {
        name: 'save',
        description: 'Manually save the currently open document.',
        permissions: [PERMISSIONS.editActiveDocument],
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
        validators: [checkCurrentFile],
        promptGenerator: 'save.',
    },
    rewrite_all: {
        name: 'rewrite_all',
        description: 'Rewrite the entire contents of the file. Your cursor will be moved to the start of the file.',
        schema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The content to rewrite the file with.' },
            },
            required: ['content'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleRewriteAll,
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: [checkCurrentFile, createStringValidator(['content'])],
        promptGenerator: (actionData: ActionData) => {
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `rewrite the entire file with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    },
    rewrite_lines: {
        name: 'rewrite_lines',
        description: 'Rewrite everything in the specified line range.'
            + ' After rewriting, your cursor will be placed at the end of the last inserted line.'
            + ' Line numbers are one-based.',
        schema: {
            type: 'object',
            properties: {
                ...LINE_RANGE_SCHEMA.properties,
                content: { type: 'string', description: 'The content to replace the selected range of lines with.' },
            },
            required: [...LINE_RANGE_SCHEMA.required!, 'content'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleRewriteLines,
        cancelEvents: commonCancelEvents,
        validators: [checkCurrentFile, createLineRangeValidator(), createStringValidator(['content'])],
        promptGenerator: (actionData: ActionData) => {
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `rewrite lines ${actionData.params.startLine}-${actionData.params.endLine} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    },
    delete_lines: {
        name: 'delete_lines',
        description: 'Delete everything in the specified line range.'
            + ' After deleting, your cursor will be placed at the end of the line before the deleted lines, if possible.'
            + ' Line numbers are one-based.',
        schema: LINE_RANGE_SCHEMA,
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleDeleteLines,
        cancelEvents: commonCancelEvents,
        validators: [checkCurrentFile, createLineRangeValidator()],
        promptGenerator: (actionData: ActionData) => {
            return `delete lines ${actionData.params.startLine}-${actionData.params.endLine}.`;
        },
    },
    highlight_lines: {
        name: 'highlight_lines',
        description: 'Highlight the specified lines.'
            + ' Can be used to draw insert_turtle_here\'s or Chat\'s attention towards something.'
            + ' This will not move your cursor.'
            + ' Line numbers are one-based.',
        schema: LINE_RANGE_SCHEMA,
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleHighlightLines,
        cancelEvents: commonCancelEvents,
        validators: [checkCurrentFile, createLineRangeValidator()],
        promptGenerator: (actionData: ActionData) => `highlight lines ${actionData.params.startLine}-${actionData.params.endLine}.`,
    },
    get_user_selection: {
        name: 'get_user_selection',
        description: 'Get insert_turtle_here\'s current selection and the text surrounding it.'
            + ' This will not move your own cursor.',
        permissions: [PERMISSIONS.getUserSelection, PERMISSIONS.editActiveDocument],
        handler: handleGetUserSelection,
        validators: [checkCurrentFile],
        promptGenerator: 'get your cursor position and surrounding text.',
    },
    replace_user_selection: {
        name: 'replace_user_selection',
        description: 'Replace insert_turtle_here\'s current selection with the provided text.'
            + ' If insert_turtle_here has no selection, this will insert the text at insert_turtle_here\'s current cursor position.'
            + ' After replacing/inserting, your cursor will be placed at the end of the inserted text.'
            + ' If "requireSelectionUnchanged" is true, the action will be automatically canceled if insert_turtle_here\'s selection changes or has changed since it was last obtained.',
        schema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The content to replace insert_turtle_here\'s selection with.' },
                requireSelectionUnchanged: { type: 'boolean', description: 'Does your change require that insert_turtle_here keeps his selection unchanged?' },
            },
            required: ['content', 'requireSelectionUnchanged'],
        },
        permissions: [PERMISSIONS.getUserSelection, PERMISSIONS.editActiveDocument],
        handler: handleReplaceUserSelection,
        cancelEvents: [
            ...commonCancelEvents,
            (actionData: ActionData) => {
                if (actionData.params.requireSelectionUnchanged)
                    return new RCECancelEvent({
                        reason: `${CONNECTION.userName}'s selection changed.`,
                        logReason: `${CONNECTION.userName}'s selection changed and requireSelectionUnchanged is set to true.`,
                        events: [[vscode.window.onDidChangeTextEditorSelection, null]],
                    });
                return null;
            },
        ],
        validators: [
            checkCurrentFile,
            createStringValidator(['content']),
            (actionData: ActionData) => { // Validate that the selection is known and unchanged if required
                if (!actionData.params.requireSelectionUnchanged)
                    return actionValidationAccept();
                if (NEURO.lastKnownUserSelection === null || NEURO.lastKnownUserSelection !== vscode.window.activeTextEditor?.selection)
                    return actionValidationFailure(`${CONNECTION.userName}'s selection has changed since it was last obtained.`);
                return actionValidationAccept();
            },
        ],
        promptGenerator: (actionData: ActionData) => {
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `replace your current selection with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    },
    diff_patch: {
        name: 'diff_patch',
        description: 'Write a diff patch to apply to the file.' +
            ' The diff patch must be written in a pseudo-search-replace-diff format.' +
            ' `>>>>>> SEARCH` and `<<<<<< REPLACE` will be used to tell what to search and what to replace,' +
            ' with `======` delimiting between the two.' +
            ' `>>>>>> SEARCH`, `<<<<<< REPLACE` and `======` must be on a separate line, and be the only content on that line.' +
            ' You can only specify **one** search/replace pair per diff patch.*' +
            ' Read the schema for an example.',
        schema: {
            type: 'object',
            properties: {
                diff: { type: 'string', description: 'The diff patch to apply. Must follow a pseudo-search-replace-diff format.', examples: ['>>>>>> SEARCH\ndef turtle():\n    return "Vedal"\n======\ndef turtle():\n    return "insert_turtle_here"\n<<<<<< REPLACE'] },
                moveCursor: { type: 'boolean', description: 'Whether or not to move the cursor to the end of the patch replacement.', default: false },
            },
            required: ['diff'],
            additionalProperties: false,
        },
        schemaFallback: {
            type: 'object',
            properties: {
                diff: { type: 'string', examples: ['>>>>>> SEARCH\ndef turtle():\n    return "Vedal"\n======\ndef turtle():\n    "insert_turtle_here"\n<<<<<< REPLACE'] },
                moveCursor: { type: 'boolean', default: false },
            },
            required: ['diff'],
            additionalProperties: false,
        },
        permissions: [PERMISSIONS.editActiveDocument],
        handler: handleDiffPatch,
        validators: [checkCurrentFile, (actionData: ActionData) => {
            const patch = parseDiffPatch(actionData.params.diff);
            if (!patch) {
                return actionValidationFailure('Invalid diff format. Expected format:\n\n```\n>>>>>> SEARCH\n[code to find]\n======\n[replacement code]\n<<<<<< REPLACE\n```');
            }

            const { search } = patch;

            if (search.length === 0) {
                return actionValidationFailure('Search content cannot be empty.');
            }

            const document = vscode.window.activeTextEditor?.document;
            if (document === undefined)
                return actionValidationFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
            const fileContent = filterFileContents(document.getText());
            if (!fileContent.includes(filterFileContents(search)))
                return actionValidationFailure('The search content was not found in the current document.');

            return actionValidationAccept();
        }],
        cancelEvents: commonCancelEvents,
        promptGenerator: (actionData: ActionData) => {
            const patch = parseDiffPatch(actionData.params.diff)!;
            const { linesAdded, linesRemoved } = countLineDifferences(patch.search, patch.replace);
            return `apply a diff patch ( +${linesAdded} | -${linesRemoved} ).`;
        },
    },
} satisfies Record<string, RCEAction>;

export function registerEditingActions() {
    if (getPermissionLevel(PERMISSIONS.editActiveDocument)) {
        NEURO.client?.registerActions(stripToActions([
            editingActions.place_cursor,
            editingActions.get_cursor,
            editingActions.get_file_contents,
            editingActions.insert_text,
            editingActions.insert_lines,
            editingActions.replace_text,
            editingActions.delete_text,
            editingActions.find_text,
            editingActions.undo,
            editingActions.rewrite_all,
            editingActions.rewrite_lines,
            editingActions.delete_lines,
            editingActions.highlight_lines,
            editingActions.get_user_selection,
            editingActions.replace_user_selection,
            editingActions.diff_patch,
        ]).filter(isActionEnabled));
        if (vscode.workspace.getConfiguration('files').get<string>('autoSave') !== 'afterDelay') {
            NEURO.client?.registerActions(stripToActions([
                editingActions.save,
            ]).filter(isActionEnabled));
        };
    }
}

export function toggleSaveAction(): void {
    const autoSave = vscode.workspace.getConfiguration('files').get<string>('autoSave');
    if (autoSave === 'afterDelay') {
        NEURO.client?.unregisterActions(['save']);
    } else {
        NEURO.client?.registerActions(stripToActions([editingActions.save]));
    }
}

export function handlePlaceCursor(actionData: ActionData): string | undefined {
    // One-based line and column (depending on config)
    let line = actionData.params.line;
    let column = actionData.params.column;
    const type = actionData.params.type;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    let basedLine: number, basedColumn: number;

    if (type === 'relative') {
        const cursor = getVirtualCursor()!;
        line += cursor.line;
        column += cursor.character;

        basedLine = line + 1;
        basedColumn = column + 1;
    }
    else {
        basedLine = line;
        basedColumn = column;

        line -= 1;
        column -= 1;
    }

    const cursorPosition = new vscode.Position(line, column);
    setVirtualCursor(cursorPosition);
    const cursorContext = getPositionContext(document, cursorPosition);
    logOutput('INFO', `Placed ${NEURO.currentController}'s virtual cursor at (${basedLine}:${basedColumn}).`);

    return `Cursor placed at (${basedLine}:${basedColumn})\n\n${formatContext(cursorContext)}`;
}

export function handleGetCursor(_actionData: ActionData): string | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const cursorPosition = getVirtualCursor()!;
    const cursorContext = getPositionContext(document, cursorPosition);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    logOutput('INFO', `Sending cursor position to ${NEURO.currentController}`);

    let cursorStyle = CONFIG.cursorPositionContextStyle;
    if (cursorStyle === 'off')
        cursorStyle = 'lineAndColumn';
    return `In file ${relativePath}.\n\n${formatContext(cursorContext)}`;
}

export function handleGetContent(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return contextFailure('No active text editor.');
    }

    const document = editor.document;
    const fileName = simpleFileName(document.fileName);
    const cursor = getVirtualCursor()!;

    if (!isPathNeuroSafe(document.fileName)) {
        return contextNoAccess(fileName);
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

    return `Contents of the file ${fileName}:\n\n${formatContext(positionContext)}`;
}

export function handleInsertText(actionData: ActionData): string | undefined {
    const text: string = actionData.params.text;
    const cursor = getVirtualCursor()!;
    let position = actionData.params.position;

    let line: number;
    let column: number;

    if (!position) position = {
        line: cursor.line + 1,
        column: cursor.character + 1,
        type: 'absolute',
    };

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    if (position.type === 'relative') {
        line = cursor.line + position.line;
        column = cursor.character + position.column;
    } else { // position.type === 'absolute'
        line = position.line - 1;
        column = position.column - 1;
    }

    const insertStart = new vscode.Position(line, column);

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, insertStart, text);

    setVirtualCursor(insertStart);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Inserting text into document');
            const document = vscode.window.activeTextEditor!.document;
            const insertEnd = getVirtualCursor()!;
            showDiffRanges(vscode.window.activeTextEditor!, {
                range: new vscode.Range(insertStart, insertEnd),
                type: DiffRangeType.Added,
            });
            const cursorContext = getPositionContext(document, { cursorPosition: insertEnd, position: insertStart, position2: insertEnd });
            NEURO.client?.sendContext(`Inserted text into document and moved your cursor\n\n${formatContext(cursorContext)}`);
        }
        else {
            NEURO.client?.sendContext(contextFailure('Failed to insert text'));
        }
    });

    return undefined;
}

export function handleInsertLines(actionData: ActionData): string | undefined {
    /**
     * The current implementation is a lazy one of just appending a newline and pasting the text in
     * We want to allow specification of the line to insert under, with the default set to the current cursor location
     */
    const cursor = getVirtualCursor()!;
    let text: string = '\n' + actionData.params.text;
    let insertLocation: number = actionData.params.insertUnder !== undefined ? actionData.params.insertUnder - 1 : cursor.line;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    // Add newlines for positions past the end of the file
    const EOFL = document.lineCount;
    if (insertLocation >= EOFL) {
        text = '\n'.repeat(insertLocation - EOFL + 1) + text;
        insertLocation = EOFL - 1;
    }

    const edit = new vscode.WorkspaceEdit();
    const insertStart = new vscode.Position(insertLocation, document.lineAt(insertLocation).text.length);
    // Virtual cursor will move with the inserted text
    setVirtualCursor(insertStart);
    edit.insert(document.uri, insertStart, text);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Inserting text lines into document');
            const document = vscode.window.activeTextEditor!.document;
            const insertEnd = getVirtualCursor()!;
            showDiffRanges(vscode.window.activeTextEditor!, {
                range: new vscode.Range(insertStart, insertEnd),
                type: DiffRangeType.Added,
            });
            const cursorContext = getPositionContext(document, { cursorPosition: insertEnd, position: insertStart, position2: insertEnd });
            NEURO.client?.sendContext(`Inserted text lines into document\n\n${formatContext(cursorContext)}`);
        }
        else {
            NEURO.client?.sendContext(contextFailure('Failed to insert text lines'));
        }
    });

    return;
}

export function handleReplaceText(actionData: ActionData): string | undefined {
    const find: string = actionData.params.find;
    const replaceWith: string = actionData.params.replaceWith;
    const match: string = actionData.params.match;
    const useRegex: boolean = actionData.params.useRegex ?? false;
    const lineRange: LineRange | undefined = actionData.params.lineRange;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const originalText = filterFileContents(document.getText());
    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');
    const cursorOffset = indexFromPosition(originalText, getVirtualCursor()!);

    const matches = findAndFilter(regex, originalText, cursorOffset, match, lineRange);
    if (matches.length === 0)
        return 'No matches found for the given parameters.';

    const edit = new vscode.WorkspaceEdit();
    for (const m of matches) {
        try {
            const replacement = useRegex ? substituteMatch(m, replaceWith) : replaceWith;
            edit.replace(document.uri, new vscode.Range(positionFromIndex(originalText, m.index), positionFromIndex(originalText, m.index + m[0].length)), replacement);
        } catch (erm) {
            logOutput('ERROR', `Error while substituting match: ${erm}`);
            return contextFailure(erm instanceof Error ? erm.message : 'Unknown error while substituting match');
        }
    }
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Replacing text in document');
            const document = vscode.window.activeTextEditor!.document;
            const newText = filterFileContents(document.getText());
            if (matches.length === 1) {
                // Single match
                const startPosition = positionFromIndex(newText, matches[0].index);
                const endPosition = positionFromIndex(newText, matches[0].index + substituteMatch(matches[0], replaceWith).length);
                setVirtualCursor(endPosition);
                const diffRanges = getDiffRanges(startPosition, matches[0][0], filterFileContents(document.getText(new vscode.Range(startPosition, endPosition))));
                showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);
                const cursorContext = getPositionContext(document, { cursorPosition: endPosition, position: startPosition, position2: endPosition });
                NEURO.client?.sendContext(`Replaced text in document\n\n${formatContext(cursorContext)}`);
            }
            else {
                // Multiple matches
                const diffRanges = getDiffRanges(new vscode.Position(0, 0), originalText, newText);
                showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);
                const cursorContext = getPositionContext(document, { cursorPosition: getVirtualCursor()! });
                NEURO.client?.sendContext(`Deleted ${matches.length} occurrences from the document\n\n${formatContext(cursorContext)}`);
            }
        }
        else {
            NEURO.client?.sendContext(contextFailure('Failed to replace text'));
        }
    });
}

export function handleDeleteText(actionData: ActionData): string | undefined {
    const find: string = actionData.params.find;
    const match: string = actionData.params.match;
    const useRegex: boolean = actionData.params.useRegex ?? false;
    const lineRange: LineRange | undefined = actionData.params.lineRange;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const originalText = filterFileContents(document.getText());

    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');
    const cursorOffset = indexFromPosition(originalText, getVirtualCursor()!);

    const matches = findAndFilter(regex, originalText, cursorOffset, match, lineRange);
    if (matches.length === 0)
        return 'No matches found for the given parameters.';

    const edit = new vscode.WorkspaceEdit();
    for (const m of matches) {
        edit.delete(document.uri, new vscode.Range(positionFromIndex(originalText, m.index), positionFromIndex(originalText, m.index + m[0].length)));
    }
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Deleting text from document');
            const document = vscode.window.activeTextEditor!.document;
            const newText = filterFileContents(document.getText());
            if (matches.length === 1) {
                // Single match
                const position = positionFromIndex(newText, matches[0].index);
                setVirtualCursor(position);
                showDiffRanges(vscode.window.activeTextEditor!, {
                    range: new vscode.Range(position, position),
                    type: DiffRangeType.Removed,
                    removedText: matches[0][0],
                });
                const cursorContext = getPositionContext(document, position);
                NEURO.client?.sendContext(`Deleted text from document\n\n${formatContext(cursorContext)}`);
            }
            else {
                // Multiple matches
                const diffRanges = getDiffRanges(new vscode.Position(0, 0), originalText, newText);
                showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);
                const cursorContext = getPositionContext(document, { cursorPosition: getVirtualCursor()! });
                NEURO.client?.sendContext(`Deleted ${matches.length} occurrences from the document\n\n${formatContext(cursorContext)}`);
            }
        }
        else {
            NEURO.client?.sendContext(contextFailure('Failed to delete text'));
        }
    });
}

export function handleFindText(actionData: ActionData): string | undefined {
    const find: string = actionData.params.find;
    const match: MatchOptions = actionData.params.match;
    const useRegex: boolean = actionData.params.useRegex ?? false;
    const lineRange: LineRange | undefined = actionData.params.lineRange;
    const moveCursor: 'before' | 'after' = actionData.params.moveCursor ?? 'after';
    const highlight: boolean = actionData.params.highlight ?? false;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const documentText = filterFileContents(document.getText());

    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');
    const cursorOffset = indexFromPosition(documentText, getVirtualCursor()!);

    const matches = findAndFilter(regex, documentText, cursorOffset, match, lineRange);
    if (matches.length === 0)
        return 'No matches found for the given parameters.';

    if (matches.length === 1) {
        // Single match
        const startPosition = positionFromIndex(documentText, matches[0].index);
        const endPosition = positionFromIndex(documentText, matches[0].index + matches[0][0].length);
        setVirtualCursor(moveCursor === 'before' ? startPosition : endPosition);
        if (highlight) {
            const range = new vscode.Range(startPosition, endPosition);
            vscode.window.activeTextEditor!.setDecorations(NEURO.highlightDecorationType!, [{
                range,
                hoverMessage: `**Highlighted by ${CONNECTION.nameOfAPI} via finding text**`,
            }]);
            vscode.window.activeTextEditor!.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
        const cursorContext = getPositionContext(document, startPosition);
        logOutput('INFO', `Placed cursor at (${endPosition.line + 1}:${endPosition.character + 1})`);
        return `Found match and placed your cursor at (${endPosition.line + 1}:${endPosition.character + 1})\n\n${formatContext(cursorContext)}`;
    }
    else {
        // Multiple matches
        const positions = matches.map(m => positionFromIndex(documentText, m.index));
        const lines = positions.map(p => document.lineAt(p.line).text);
        // max(1, ...) because log10(0) is -Infinity
        // const padding = Math.max(1, Math.log10(positions[positions.length - 1].line + 1) + 1); // Space for the line number
        logOutput('INFO', `Found ${positions.length} matches`);
        // const text = lines.map((line, i) => `L. ${(positions[i].line + 1).toString().padStart(padding)}: ${line}`).join('\n');
        if (highlight) {
            vscode.window.activeTextEditor!.setDecorations(NEURO.highlightDecorationType!, matches.map((match, i) => ({
                range: new vscode.Range(positions[i], positionFromIndex(documentText, match.index + match[0].length)),
                hoverMessage: `**Highlighted by ${CONNECTION.nameOfAPI} via finding text**`,
            })));
        }
        const lineNumberContextFormat = CONFIG.lineNumberContextFormat || '{n}|';
        const text = lines.map((line, i) => lineNumberContextFormat.replace('{n}', (positions[i].line + 1).toString()) + line).join('\n');
        const fence = getFence(text);
        return `Found ${positions.length} matches:\n\n${fence}\n${text}\n${fence}`;
    }
}

export function handleUndo(_actionData: ActionData): string | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    clearDecorations(vscode.window.activeTextEditor!);

    vscode.commands.executeCommand('undo').then(
        () => {
            logOutput('INFO', 'Undoing last action in document');
            // We don't keep track of the virtual cursor position in the undo stack, so we reset it to the real cursor position
            const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
            setVirtualCursor(vscode.window.activeTextEditor!.selection.active);
            NEURO.client?.sendContext(`Undid last action in document\n\n${formatContext(cursorContext)}`);
        },
        (erm) => {
            logOutput('ERROR', `Failed to undo last action: ${erm}`);
            NEURO.client?.sendContext(contextFailure('Failed to undo last action'));
        },
    );

    return undefined;
}

export function handleSave(_actionData: ActionData): string | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    NEURO.saving = true;
    logOutput('INFO', `${NEURO.currentController} is saving the current document.`);

    document.save().then(
        (saved) => {
            if (saved) {
                logOutput('INFO', 'Document saved successfully.');
                NEURO.client?.sendContext('Document saved successfully.', true);
            } else {
                logOutput('WARN', 'Document save returned false.');
                NEURO.client?.sendContext('Document did not save.', false);
            }
            NEURO.saving = false;
        },
        (erm: string) => {
            logOutput('ERROR', `Failed to save document: ${erm}`);
            NEURO.client?.sendContext(contextFailure('Failed to save document.'), false);
            NEURO.saving = false;
        },
    );

    return undefined;
}

export function handleRewriteAll(actionData: ActionData): string | undefined {
    const content: string = actionData.params.content;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const originalText = document.getText();

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
    );
    edit.replace(document.uri, fullRange, content);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Rewrote entire document content');
            const document = vscode.window.activeTextEditor!.document;
            const relativePath = vscode.workspace.asRelativePath(document.uri);
            const lineCount = content.trim().split('\n').length;

            // Set cursor to beginning of file
            const startPosition = new vscode.Position(0, 0);
            setVirtualCursor(startPosition);

            // No need to filter content here, as both texts are directly from the document
            const diffRanges = getDiffRanges(new vscode.Position(0, 0), originalText, document.getText());
            showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);

            const cursorContext = getPositionContext(document, startPosition);
            NEURO.client?.sendContext(`Rewrote entire file ${relativePath} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content\n\n${formatContext(cursorContext)}`);
        } else {
            NEURO.client?.sendContext(contextFailure('Failed to rewrite document content'));
        }
    });

    return undefined;
}

export function handleDeleteLines(actionData: ActionData): string | undefined {
    const startLine = actionData.params.startLine;
    const endLine = actionData.params.endLine;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const edit = new vscode.WorkspaceEdit();
    const startPosition = new vscode.Position(startLine - 1, 0);
    const endLineZero = endLine - 1;
    // Include the trailing newline by ending at the start of the line after endLine when possible
    const endPosition = endLineZero + 1 < document.lineCount
        ? new vscode.Position(endLineZero + 1, 0)
        : new vscode.Position(endLineZero, document.lineAt(endLineZero).text.length);
    const originalText = document.getText(new vscode.Range(startPosition, endPosition));
    edit.delete(document.uri, new vscode.Range(startPosition, endPosition));

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri);
            // Defer cursor update until edits have fully settled
            setTimeout(() => {
                const documentPost = vscode.window.activeTextEditor!.document;
                if (startLine <= 1) {
                    // If deleting from the first line, place cursor at start of new first line
                    const cursorPosition = new vscode.Position(0, 0);
                    setVirtualCursor(cursorPosition);
                    const cursorContext = getPositionContext(documentPost, cursorPosition);
                    logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to start of line 1`);
                    NEURO.client?.sendContext(`Deleted lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`);
                } else {
                    // Move cursor to end of line before the deleted lines
                    const targetLineZero = Math.max(0, startLine - 2); // 0-based line before deleted block
                    if (targetLineZero < documentPost.lineCount) {
                        const cursorPosition = new vscode.Position(targetLineZero, documentPost.lineAt(targetLineZero).text.length);
                        setVirtualCursor(cursorPosition);
                        const cursorContext = getPositionContext(documentPost, cursorPosition);
                        logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to end of line ${targetLineZero + 1}`);
                        NEURO.client?.sendContext(`Deleted lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`);
                    } else if (documentPost.lineCount > 0) {
                        // Fallback: place cursor at the end of the document
                        const cursorPosition = new vscode.Position(documentPost.lineCount - 1, documentPost.lineAt(documentPost.lineCount - 1).text.length);
                        setVirtualCursor(cursorPosition);
                        const cursorContext = getPositionContext(documentPost, cursorPosition);
                        logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to end of document`);
                        NEURO.client?.sendContext(`Deleted lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`);
                    } else {
                        // Empty document edge case
                        const cursorPosition = new vscode.Position(0, 0);
                        setVirtualCursor(cursorPosition);
                        const cursorContext = getPositionContext(documentPost, cursorPosition);
                        logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to start of document`);
                        NEURO.client?.sendContext(`Deleted lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`);
                    }
                }

                showDiffRanges(vscode.window.activeTextEditor!, {
                    range: new vscode.Range(startPosition, startPosition),
                    type: DiffRangeType.Removed,
                    removedText: originalText,
                });
            }, 0);
        } else {
            NEURO.client?.sendContext(contextFailure('Failed to delete lines'));
        }
    });

    return undefined;
}

export function handleRewriteLines(actionData: ActionData): string | undefined {
    const startLine = actionData.params.startLine;
    const endLine = actionData.params.endLine;
    const content = actionData.params.content;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const edit = new vscode.WorkspaceEdit();
    const startPosition = new vscode.Position(startLine - 1, 0);
    const endLineZero = endLine - 1;
    // Preserve the following line's newline by ending at the end of endLine
    const endPosition = document.lineAt(endLineZero).range.end;
    const originalText = document.getText(new vscode.Range(startPosition, endPosition));
    edit.replace(document.uri, new vscode.Range(startPosition, endPosition), content);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri);
            // Defer cursor update until edits have fully settled
            setTimeout(() => {
                const documentPost = vscode.window.activeTextEditor!.document;
                // Move cursor to end of the last inserted line
                const hasTrailingNewline = content.endsWith('\n');
                const contentLines = content.split('\n');
                const logicalLines = hasTrailingNewline ? contentLines.length - 1 : contentLines.length;
                const lastInsertedLineZero = Math.min(
                    documentPost.lineCount - 1,
                    Math.max(0, startLine - 1 + (logicalLines - 1)),
                );
                const cursorPosition = new vscode.Position(lastInsertedLineZero, documentPost.lineAt(lastInsertedLineZero).text.length);
                setVirtualCursor(cursorPosition);
                // No need to filter content here, as both texts are directly from the document
                const diffRanges = getDiffRanges(startPosition, originalText, document.getText(new vscode.Range(startPosition, cursorPosition)));
                showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);
                const cursorContext = getPositionContext(documentPost, { cursorPosition: cursorPosition, position: startPosition, position2: cursorPosition });
                logOutput('INFO', `Rewrote lines ${startLine}-${endLine} with ${logicalLines} line${logicalLines === 1 ? '' : 's'} of content and moved cursor to end of line ${lastInsertedLineZero + 1}`);
                NEURO.client?.sendContext(`Rewrote lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`);
            }, 0);
        } else {
            NEURO.client?.sendContext(contextFailure('Failed to rewrite lines'));
        }
    });

    return undefined;
}

export function handleHighlightLines(actionData: ActionData): string | undefined {
    const startLine: number = actionData.params.startLine;
    const endLine: number = actionData.params.endLine;

    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const startPosition = new vscode.Position(startLine - 1, 0);
    const endPosition = new vscode.Position(endLine - 1, document.lineAt(endLine - 1).text.length);

    const range = new vscode.Range(startPosition, endPosition);

    editor!.setDecorations(NEURO.highlightDecorationType!, [{
        range,
        hoverMessage: `**Highlighted manually by ${CONNECTION.nameOfAPI}**`,
    }]);
    editor!.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    return `Highlighted lines ${startLine}-${endLine}.`;
}

export function handleDiffPatch(actionData: ActionData): string | undefined {
    const diff = actionData.params.diff;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    // Parse the diff patch
    const parsedDiff = parseDiffPatch(diff)!;
    parsedDiff.search = filterFileContents(parsedDiff.search);
    parsedDiff.replace = filterFileContents(parsedDiff.replace);
    const { search, replace } = parsedDiff;

    // Find the search text in the document
    const filteredText = filterFileContents(document.getText());
    const searchIndex = filteredText.indexOf(search);
    if (searchIndex === -1) {
        return contextFailure(`Search text not found in the document:\n\n${getFence(search)}\n${search}\n${getFence(search)}`);
    }
    const startPosition = positionFromIndex(filteredText, searchIndex);
    const endPosition = positionFromIndex(filteredText, searchIndex + search.length);

    // Check for multiple occurrences
    const secondOccurrence = filteredText.indexOf(search, searchIndex + 1);
    if (secondOccurrence !== -1) {
        return contextFailure(`Multiple occurrences of search text found. Please use a longer search term for a unique match:\n\n${getFence(search)}\n${search}\n${getFence(search)}`);
    }

    // Perform the replacement
    const range = new vscode.Range(startPosition, endPosition);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, replace);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Applied diff patch to document');

            const newEndPosition = positionFromIndex(filteredText, searchIndex + replace.length);
            let cursorPosition: vscode.Position;

            if (actionData.params.moveCursor === true) {
                // Update cursor position to the end of the replaced text
                cursorPosition = newEndPosition;
                setVirtualCursor(cursorPosition);
            } else {
                // Keep current cursor position for context
                cursorPosition = getVirtualCursor()!;
            }

            // Show diff highlighting
            const diffRanges = getDiffRanges(startPosition, search, replace);
            showDiffRanges(vscode.window.activeTextEditor!, ...diffRanges);

            // Provide context feedback
            const cursorContext = getPositionContext(document, {
                cursorPosition: cursorPosition,
                position: startPosition,
                position2: newEndPosition,
            });

            NEURO.client?.sendContext(`Applied diff patch successfully\n\n${formatContext(cursorContext)}`);
        } else {
            NEURO.client?.sendContext(contextFailure('Failed to apply diff patch'));
        }
    });

    return undefined;
}

function handleGetUserSelection(_actionData: ActionData): string | undefined {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (editor === undefined || document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    NEURO.lastKnownUserSelection = editor.selection;

    const cursorContext = getPositionContext(document, {
        position: editor.selection.start,
        position2: editor.selection.end,
        cursorPosition: getVirtualCursor() ?? undefined,
    });
    const preamble = editor.selection.isEmpty
        ? `${CONNECTION.userName}'s cursor is at (${editor.selection.active.line + 1}:${editor.selection.active.character + 1}).`
        : `${CONNECTION.userName}'s selection is from (${editor.selection.start.line + 1}:${editor.selection.start.character + 1}) to (${editor.selection.end.line + 1}:${editor.selection.end.character + 1}).`;

    const selectedText = editor.document.getText(editor.selection);
    const fence = getFence(selectedText);
    const postamble = editor.selection.isEmpty
        ? ''
        : `\n\n${CONNECTION.userName}'s selection contains:\n\n${fence}\n${selectedText}\n${fence}`;

    return `${preamble}\n\n${formatContext(cursorContext)}${postamble}`;
}

export function handleReplaceUserSelection(actionData: ActionData): string | undefined {
    const content: string = actionData.params.content;

    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (editor === undefined || document === undefined)
        return contextFailure(CONTEXT_NO_ACTIVE_DOCUMENT);
    if (!isPathNeuroSafe(document.fileName))
        return contextFailure(CONTEXT_NO_ACCESS);

    const edit = new vscode.WorkspaceEdit();
    const selection = editor.selection;
    const originalText = filterFileContents(document.getText(selection));
    edit.replace(document.uri, selection, content);

    setVirtualCursor(selection.end);

    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Replaced user selection in document');
            const diffRanges = getDiffRanges(selection.start, originalText, content);
            showDiffRanges(editor, ...diffRanges);
            const cursor = editor.selection.end;
            setVirtualCursor(cursor);
            const cursorContext = getPositionContext(document, {
                cursorPosition: cursor,
                position: selection.start,
                position2: cursor,
            });
            NEURO.client?.sendContext(`Replaced ${CONNECTION.userName}'s selection in the document\n\n${formatContext(cursorContext)}`);

            NEURO.lastKnownUserSelection = editor.selection;
        }
    });
}

export function fileSaveListener(e: vscode.TextDocument) {
    /**
     * In order from left to right, this function immediately returns if:
     * - NeuroPilot > Send Save Notifications is set to false
     * - the file that was saved isn't Neuro safe
     * - Neuro manually saved the file.
     */
    if (!CONFIG.sendSaveNotifications || !isPathNeuroSafe(e.fileName) || NEURO.saving === true) {
        return;
    }
    const relativePath = vscode.workspace.asRelativePath(e.uri);
    NEURO.client?.sendContext(`File ${relativePath} has been saved.`, true);
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
function findAndFilter(regex: RegExp, text: string, cursorOffset: number, match: string, lineRange: LineRange | undefined = undefined): RegExpExecArray[] {
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

let editorChangeHandlerTimeout: NodeJS.Timeout | undefined;
/**
 * Sets and displays the virtual cursor position when the active text editor changes.
 * @param editor The active text editor.
 */
export function editorChangeHandler(editor: vscode.TextEditor | undefined) {
    if (editorChangeHandlerTimeout)
        clearTimeout(editorChangeHandlerTimeout);

    // Remove last known selection
    NEURO.lastKnownUserSelection = null;

    if (editor) {
        // Set cursor
        const uri = editor.document.uri;
        if (!NEURO.cursorOffsets.has(uri)) {
            if (isPathNeuroSafe(uri.fsPath))
                setVirtualCursor(editor.selection.active);
            else
                setVirtualCursor(null);
        }
        else {
            setVirtualCursor();
        }

        // Tell Neuro that the editor changed
        if (isPathNeuroSafe(uri.fsPath)) {
            const file = simpleFileName(editor.document.fileName);
            const cursor = getVirtualCursor()!;
            const context = getPositionContext(editor.document, cursor);
            let text = `Switched to file ${file}.`;
            if (CONFIG.sendContentsOnFileChange)
                text += `\n\n${formatContext(context)}`;
            NEURO.client?.sendContext(text);
        }
        else {
            NEURO.client?.sendContext('Switched to a file you\'re not allowed to edit.');
        }
    }
    else {
        // Switching editors first triggers this event with an undefined editor and then with the new editor
        // Delay sending the context to wait for a second event
        editorChangeHandlerTimeout = setTimeout(() => {
            NEURO.client?.sendContext('Switched to a non-editable file.');
            editorChangeHandlerTimeout = undefined;
        }, 200);
    }
}

/**
 * Moves the virtual cursor when the text document changes.
 * @param event The editing event.
 * @returns 
 */
export async function workspaceEditHandler(event: vscode.TextDocumentChangeEvent) {
    if (event.contentChanges.length === 0) return;
    if (event.document !== vscode.window.activeTextEditor?.document) return;
    if (!getPermissionLevel(PERMISSIONS.editActiveDocument)) return;
    if (event.document.fileName.startsWith('extension-output-')) return; // Ignore extension output to avoid infinite logging

    // Diffs
    clearDecorations(vscode.window.activeTextEditor);

    // Cursor stuff
    const initialCursorOffset = NEURO.cursorOffsets.get(event.document.uri);
    if (initialCursorOffset === undefined || initialCursorOffset === null) return;

    for (const change of event.contentChanges) {
        logOutput('DEBUG', `Change detected in document ${event.document.fileName}: ${JSON.stringify(change)}`);

        const cursorOffset = NEURO.cursorOffsets.get(event.document.uri)!;
        const startOffset = event.document.offsetAt(change.range.start);

        if (startOffset > cursorOffset)
            // Change is after the cursor, no need to update it
            continue;

        const endOffset = change.rangeOffset + change.rangeLength;

        if (endOffset > cursorOffset) {
            // Change includes the cursor, place it at the end of the change
            setVirtualCursor(event.document.positionAt(change.rangeOffset + change.text.length));
        }
        else {
            // Change is before the cursor, move it by the change length
            const delta = change.text.length - change.rangeLength;
            setVirtualCursor(event.document.positionAt(cursorOffset + delta));
        }
    }
}

export function moveNeuroCursorHere() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor');
        return;
    }
    if (!isPathNeuroSafe(editor.document.fileName)) {
        vscode.window.showErrorMessage(NEURO.currentController + ' does not have permission to access this file');
        return;
    }
    setVirtualCursor(editor.selection.active);

    const cursorContext = getPositionContext(editor.document, editor.selection.active);

    NEURO.client?.sendContext(`${CONNECTION.userName} moved your cursor.\n\n${formatContext(cursorContext)}`);
}

/**
 * Handler to send the currently selected text to Neuro.
 */
export async function handleSendSelectionToNeuro(): Promise<void> {
    if (!NEURO.connected) {
        logOutput('ERROR', `Attempted to send code selection to ${CONNECTION.nameOfAPI} while disconnected.`);
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor.');
        return;
    }
    const document = editor.document;
    if (!isPathNeuroSafe(document.fileName)) {
        vscode.window.showErrorMessage(`${CONNECTION.nameOfAPI} does not have permission to access this file.`);
        return;
    }
    const selection = editor.selection;
    NEURO.lastKnownUserSelection = selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('No text selected.');
        return;
    }
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const selectedText = document.getText(selection);
    const fence = getFence(selectedText);
    const startLine = selection.start.line + 1;
    const startCol = selection.start.character + 1;
    const endLine = selection.end.line + 1;
    const endCol = selection.end.character + 1;
    const message = `${CONNECTION.userName} sent you his currently highlighted content from file ${relativePath}, lines ${startLine}:${startCol} to ${endLine}:${endCol} (line:column):\n\nContent:\n${fence}${document.languageId}\n${selectedText}\n${fence}`;

    NEURO.client?.sendContext(message);
    vscode.window.showInformationMessage('Selection sent to Neuro.');
}

/**
 * Code action provider for sending selection to Neuro.
 */
class SendSelectionToNeuroCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] | undefined {
        if (range.isEmpty || !isPathNeuroSafe(document.fileName)) return;
        const action = new vscode.CodeAction('Send selection to Neuro', vscode.CodeActionKind.QuickFix);
        action.command = {
            title: 'Send selection to Neuro',
            command: 'neuropilot.sendSelectionToNeuro',
        };
        return [action];
    }
}

/**
 * Register the command and code action provider for sending selection to Neuro.
 */
export function registerSendSelectionToNeuro(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('neuropilot.sendSelectionToNeuro', handleSendSelectionToNeuro),
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            new SendSelectionToNeuroCodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
        ),
    );
}

interface DiffPatch {
    search: string;
    replace: string;
}

function parseDiffPatch(diff: string): DiffPatch | null {
    // Remove the outer code block markers if present
    const cleanDiff = diff.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();

    // Look for the pattern: >>>>>> SEARCH ... ======= ... <<<<<< REPLACE
    const searchStartPattern = /^>>>>>> SEARCH\s*?\r?\n/m;
    const delimiterPattern = /^======\s*?\r?\n/m;
    const replaceEndPattern = /^<<<<<< REPLACE\s*$/m;

    const searchStartMatch = searchStartPattern.exec(cleanDiff);
    const delimiterMatch = delimiterPattern.exec(cleanDiff);
    const replaceEndMatch = replaceEndPattern.exec(cleanDiff);

    if (!searchStartMatch || !delimiterMatch || !replaceEndMatch) {
        return null;
    }

    // Ensure they appear in the correct order
    if (searchStartMatch.index >= delimiterMatch.index ||
        delimiterMatch.index >= replaceEndMatch.index) {
        return null;
    }

    // Extract the search and replace content
    const searchStart = searchStartMatch.index + searchStartMatch[0].length;
    const searchEnd = Math.max(delimiterMatch.index - 1, searchStart); // -1 to remove the newline before ======
    const replaceStart = delimiterMatch.index + delimiterMatch[0].length;
    const replaceEnd = Math.max(replaceEndMatch.index - 1, replaceStart); // -1 to remove the newline before <<<<<< REPLACE

    const search = cleanDiff.substring(searchStart, searchEnd);
    const replace = cleanDiff.substring(replaceStart, replaceEnd);

    return { search, replace };
}

/**
 * Count the line differences between search and replace text in a diff patch.
 * @param search The text to be replaced
 * @param replace The replacement text
 * @returns Object containing lines added, removed, and a description string
 */
function countLineDifferences(search: string, replace: string): {
    linesAdded: number;
    linesRemoved: number;
    description: string;
} {
    // Split into lines, handling empty strings
    const searchLines = search ? search.split('\n') : [];
    const replaceLines = replace ? replace.split('\n') : [];

    const linesRemoved = searchLines.length;
    const linesAdded = replaceLines.length;

    // Generate description
    let description = '';

    if (linesAdded === 0 && linesRemoved === 0) {
        description = 'no changes';
    } else if (linesAdded === 0) {
        description = `${linesRemoved} line${linesRemoved === 1 ? '' : 's'} removed`;
    } else if (linesRemoved === 0) {
        description = `${linesAdded} line${linesAdded === 1 ? '' : 's'} added`;
    } else if (linesAdded === linesRemoved) {
        description = `${linesAdded} line${linesAdded === 1 ? '' : 's'} modified`;
    } else {
        const parts: string[] = [];
        if (linesRemoved > 0) {
            parts.push(`${linesRemoved} line${linesRemoved === 1 ? '' : 's'} removed`);
        }
        if (linesAdded > 0) {
            parts.push(`${linesAdded} line${linesAdded === 1 ? '' : 's'} added`);
        }
        description = parts.join(', ');
    }

    return {
        linesAdded,
        linesRemoved,
        description,
    };
}

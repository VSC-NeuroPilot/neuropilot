import * as vscode from 'vscode';

import { RCEContext } from '@ctx/rce';
import { EXCEPTION_THROWN_STRING, NEURO, PROMISE_REJECTION_STRING } from './constants';
import { previewCursorMovement, previewFindFunctions } from './edit_files';
import { isPathNeuroSafe, getVirtualCursor, setVirtualCursor, getPositionContext, logOutput, formatContext, getFence, escapeRegExp, filterFileContents, indexFromPosition, positionFromIndex, getWorkspacePath, getWorkspaceUri, NeuroPositionContext, normalizePath, notifyOnCaughtException, simpleFileName } from './utils/misc';
import { RCEAction, RCEHandlerReturns, actionHandlerFailure, actionHandlerSuccess, actionValidationAccept, actionValidationFailure } from './utils/neuro_client';
import { ACTION_FAIL_NOTES, binaryFileValidation, cancelOnDidChangeActiveTextEditor, checkCurrentFile, commonCancelEvents, commonCancelEventsWithCursor, CONTEXT_NO_ACCESS, CONTEXT_NO_ACTIVE_DOCUMENT, createLineRangeValidator, createPositionValidator, createStringValidator, findAndFilter, LINE_RANGE_SCHEMA, LineRange, MATCH_OPTIONS, MatchOptions, neuroSafeValidation, POSITION_SCHEMA, STATUS_NO_ACCESS, STATUS_NO_ACTIVE_DOCUMENT, STATUS_NO_MATCHES_FOUND, validateIsAFile, validateRegex } from './utils/action_components';
import { CONFIG, CONNECTION } from './config';
import { targetedFileDeletedEvent } from '@events/files';
import { RCECancelEvent } from '@events/utils';
import { filePreviewProvider } from '@previews/files';
import { addActions } from './rce';

const CATEGORY_READING = 'Read Files';

export const readFileActions = {
    read_file: {
        name: 'read_file',
        description: 'Read a file\'s contents without opening it.' +
            'If filePath is not specified, reads the currently open file. ',
        category: CATEGORY_READING,
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
            async: [
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
    switch_files: {
        name: 'switch_files',
        description: 'Switch to a different file in the workspace. You cannot open a binary file directly.',
        category: CATEGORY_READING,
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
            async: [neuroSafeValidation(true), validateIsAFile, binaryFileValidation],
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
    move_cursor_position: {
        name: 'move_cursor_position',
        description: 'Move your cursor in the current file to the specified position. Line and column numbers are one-based for "absolute" and zero-based for "relative".',
        category: CATEGORY_READING,
        schema: {
            ...POSITION_SCHEMA,
            description: undefined,
        },
        handler: handlePlaceCursor,
        preview: (context) => previewCursorMovement(context.data.params, 'move her cursor to this position.'),
        validators: {
            sync: [checkCurrentFile, createPositionValidator()],
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => {
            const actionData = context.data;
            return `${actionData.params.type === 'absolute' ? 'place her cursor at' : 'move her cursor by'} (${actionData.params.line}:${actionData.params.column}).`;
        },
    },
    get_cursor_position: {
        name: 'get_cursor_position',
        description: 'Get your current cursor position and the text surrounding it.',
        category: CATEGORY_READING,
        handler: handleGetCursor,
        validators: {
            sync: [checkCurrentFile],
        },
        cancelEvents: commonCancelEventsWithCursor,
        promptGenerator: 'get her current cursor position and the text surrounding it.',
    },
    get_user_selection: {
        name: 'get_user_selection',
        description: 'Get insert_turtle_here\'s current selection and the text surrounding it.'
            + ' This will not move your own cursor.',
        category: CATEGORY_READING,
        handler: handleGetUserSelection,
        // No preview effect needed, intended preview effect is the user cursor
        validators: {
            sync: [checkCurrentFile],
        },
        promptGenerator: 'get your cursor position and surrounding text.',
    },
    highlight_lines: {
        name: 'highlight_lines',
        description: 'Highlight the specified lines.'
            + ' Can be used to draw insert_turtle_here\'s or Chat\'s attention towards something.'
            + ' This will not move your cursor.'
            + ' Line numbers are one-based.',
        category: CATEGORY_READING,
        schema: LINE_RANGE_SCHEMA,
        handler: handleHighlightLines,
        cancelEvents: commonCancelEvents,
        validators: {
            sync: [checkCurrentFile, createLineRangeValidator()],
        },
        promptGenerator: (context: RCEContext) => `highlight lines ${context.data.params.startLine}-${context.data.params.endLine}.`,
    },
    find_text: {
        name: 'find_text',
        description: 'Find text in the active document.'
            + ' If you set "useRegex" to true, you can use a Regex in the "find" parameter.'
            + ' This will place your cursor directly before or after the found text (depending on "moveCursor"), unless you searched for multiple instances.'
            + ' Set "highlight" to true to highlight the found text, if you want to draw insert_turtle_here\'s or Chat\'s attention to it.'
            + ' If you search for multiple matches, the numbers at the start of each line are the one-based line numbers and not part of the code.',
        category: CATEGORY_READING,
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
        handler: handleFindText,
        preview: (context) => previewFindFunctions(context.data, 'find'),
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: {
            sync: [checkCurrentFile, createStringValidator(['find']), createLineRangeValidator('lineRange'), validateRegex('find', 'useRegex')],
        },
        promptGenerator: (context: RCEContext) => {
            const actionData = context.data;
            let text = 'find ';
            const target = actionData.params.find;
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
} satisfies Record<string, RCEAction>;

export function addReadActions() {
    addActions([
        readFileActions.read_file,
        readFileActions.switch_files,
        readFileActions.move_cursor_position,
        readFileActions.get_cursor_position,
        readFileActions.get_user_selection,
        readFileActions.highlight_lines,
        readFileActions.find_text,
    ]);
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

export function handlePlaceCursor(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    // One-based line and column (depending on config)
    let line = actionData.params.line;
    let column = actionData.params.column;
    const type = actionData.params.type;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

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

    return actionHandlerSuccess(`Cursor placed at (${basedLine}:${basedColumn})\n\n${formatContext(cursorContext)}`, `Cursor placed at (${basedLine}:${basedColumn})`);
}

export function handleGetCursor(): RCEHandlerReturns {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const cursorPosition = getVirtualCursor()!;
    const cursorContext = getPositionContext(document, cursorPosition);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    logOutput('INFO', `Sending cursor position to ${NEURO.currentController}`);

    return actionHandlerSuccess(`In file ${relativePath}.\n\n${formatContext(cursorContext)}`, `Retrieved cursor at line ${cursorPosition.line + 1}, column ${cursorPosition.character + 1}`);
}

function handleGetUserSelection(): RCEHandlerReturns {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (editor === undefined || document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

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

    return actionHandlerSuccess(`${preamble}\n\n${formatContext(cursorContext)}${postamble}`, `Cursor selection for ${CONNECTION.userName} formatted and sent to ${CONNECTION.nameOfAPI}.`);
}

export function handleHighlightLines(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    const startLine: number = actionData.params.startLine;
    const endLine: number = actionData.params.endLine;

    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const startPosition = new vscode.Position(startLine - 1, 0);
    const endPosition = new vscode.Position(endLine - 1, document.lineAt(endLine - 1).text.length);

    const range = new vscode.Range(startPosition, endPosition);

    editor!.setDecorations(NEURO.highlightDecorationType!, [{
        range,
        hoverMessage: `**Highlighted manually by ${CONNECTION.nameOfAPI}**`,
    }]);
    editor!.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    return actionHandlerSuccess(`Highlighted lines ${startLine}-${endLine}.`, `Highlighted lines ${startLine}-${endLine}`);
}

export function handleFindText(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    const find: string = actionData.params.find;
    const match: MatchOptions = actionData.params.match;
    const useRegex: boolean = actionData.params.useRegex ?? false;
    const lineRange: LineRange | undefined = actionData.params.lineRange;
    const moveCursor: 'start' | 'end' = actionData.params.moveCursor ?? 'start';
    const highlight: boolean = actionData.params.highlight ?? false;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const documentText = filterFileContents(document.getText());

    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'gm');
    const cursorOffset = indexFromPosition(documentText, getVirtualCursor()!);

    const matches = findAndFilter(regex, documentText, cursorOffset, match, lineRange);
    if (matches.length === 0) {
        return actionHandlerFailure('No matches found for the given parameters.', STATUS_NO_MATCHES_FOUND);
    }

    if (matches.length === 1) {
        // Single match
        const startPosition = positionFromIndex(documentText, matches[0].index);
        const endPosition = positionFromIndex(documentText, matches[0].index + matches[0][0].length);
        if (actionData.params?.moveCursor) setVirtualCursor(moveCursor === 'start' ? startPosition : endPosition);
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
        return actionHandlerSuccess(`Found match ${actionData.params?.moveCursor ? 'and placed your cursor ' : ''}at (${endPosition.line + 1}:${endPosition.character + 1})\n\n${formatContext(cursorContext)}`, 'Found 1 match');
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
        return actionHandlerSuccess(`Found ${positions.length} matches:\n\n${fence}\n${text}\n${fence}`, `Found ${positions.length} matches`);
    }
}

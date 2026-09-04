import * as vscode from 'vscode';
import { z } from 'zod';

import { NEURO } from '@/constants';
import { DiffRangeType, getDiffRanges, getFence, getPositionContext, getVirtualCursor, showDiffRanges, isPathNeuroSafe, logOutput, setVirtualCursor, simpleFileName, clearDecorations, formatContext, filterFileContents, positionFromIndex, NeuroPositionContext } from '@/utils/misc';
import { actionValidationAccept, actionValidationFailure, RCEHandlerReturns, actionHandlerSuccess, actionHandlerFailure, defineAction } from '@/utils/neuro_client';
import { CONFIG, CONNECTION } from '@/config';
import { createCursorPositionChangedEvent } from '@events/cursor';
import { RCECancelEvent } from '@events/utils';
import { addActions } from '@/rce';
import { createPreviewCursor, createPreviewHighlight } from '@previews/edits';
import { RCEContext } from '@/context/rce';
import { commonCancelEvents, cancelOnDidChangeActiveTextEditor, checkCurrentFile, createPositionValidator, CONTEXT_NO_ACCESS, CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACCESS, STATUS_NO_ACTIVE_DOCUMENT, LineRange, _POSITION_SCHEMA, createLineRangeValidator, createStringValidator, _LINE_RANGE_SCHEMA, previewLineHighlights } from './utils/action_components';

export const CATEGORY_EDITING = 'Edit Files';

/**
 * Common function used to show previews for cursor movement actions
 */
export function previewCursorMovement(positionParam: { line: number, column: number, type: 'absolute' | 'relative' }, prompt: string) {
    let line = positionParam.line;
    let column = positionParam.column;
    if (positionParam.type === 'relative') {
        const cursor = getVirtualCursor()!;
        line += cursor.line;
        column += cursor.character;
    }
    else {
        line -= 1;
        column -= 1;
    }
    const disposable = createPreviewCursor();
    const position = new vscode.Position(line, column);
    vscode.window.activeTextEditor!.setDecorations(disposable, [{
        range: new vscode.Range(position, position),
        hoverMessage: `(Preview) ${NEURO.currentController} wants to ${prompt}`,
    }] as const);
    return disposable;
}

export const editFileActions = {
    insert_text: defineAction({
        name: 'insert_text',
        description: 'Insert code at the specified position.'
            + ' Line and column numbers are one-based for "absolute" and zero-based for "relative".'
            + ' If no position is specified, your cursor\'s current position will be used.'
            + ' Remember to add indents after newlines where appropriate.'
            + ' After inserting, your cursor will be placed at the end of the inserted text.'
            + ' Also make sure you use new lines and indentation appropriately.',
        category: CATEGORY_EDITING,
        schema: z.object({
            text: z.string().meta({
                description: 'The text to insert.',
            }),
            position: _POSITION_SCHEMA.optional(),
        }),
        handler: ({ data: { params } }) => returnHandleInsertText(params.text, params.position),
        preview: (context) => {
            const positionParam = context.data.params.position;
            if (!positionParam) return { dispose: () => { } };
            else return previewCursorMovement(positionParam, 'insert text at this position.');
        },
        cancelEvents: [
            ...commonCancelEvents,
            (context) => {
                return context.data.params.position ? null : createCursorPositionChangedEvent();
            },
        ],
        validators: {
            sync: [checkCurrentFile, createPositionValidator('position'), createStringValidator(['text'])],
        },
        promptGenerator: (context) => {
            const actionData = context.data;
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
    }),
    insert_lines: defineAction({
        name: 'insert_lines',
        description: 'Insert code below a certain line.'
            + ' Defaults to your current cursor\'s location'
            + ' The insertUnder parameter is one-based, not zero-based.'
            + ' Remember to add indents after newlines where appropriate.'
            + ' Your cursor will be moved to the end of the inserted line.', // TODO: Clarify cursor stuff again
        category: CATEGORY_EDITING,
        schema: z.object({
            text: z.string().meta({
                description: 'The text to insert',
            }),
            insertUnder: z.int({}).min(1).optional().meta({
                description: 'The one-based line number to insert under.',
            }),
        }),
        handler: (ctx) => returnHandleInsertLines(ctx.data.params.text, ctx.data.params.insertUnder),
        preview: (context) => {
            const length = (context.data.params.text as string).split('\n').length;
            let line: number | undefined = context.data.params?.insertUnder;
            if (!line) {
                line = getVirtualCursor()!.line;
            } else {
                line -= 1;
            };
            const editor = vscode.window.activeTextEditor!;
            const disposable = createPreviewHighlight();

            if (line >= editor.document.lineCount)
                line = editor.document.lineCount - 1;

            const startPosition = new vscode.Position(line, 0);
            const endPosition = new vscode.Position(line, editor.document.lineAt(line).text.length);

            editor.setDecorations(disposable, [
                {
                    range: new vscode.Range(startPosition, endPosition),
                    hoverMessage: `(Preview) ${NEURO.currentController} wants to insert ${length} line${length === 1 ? '' : 's'} of text UNDER this line.`,
                },
            ] as const);

            return disposable;
        },
        cancelEvents: [
            ...commonCancelEvents,
            (context) => {
                return context.data.params.insertUnder ? null : createCursorPositionChangedEvent();
            },
        ],
        validators: {
            sync: [checkCurrentFile, createStringValidator(['lines'])],
        },
        promptGenerator: (context) => {
            const actionData = context.data;
            const lines = actionData.params.text.trim().split('\n').length;
            const insertUnder = actionData.params.insertUnder;
            return `insert ${lines} line${lines !== 1 ? 's' : ''} of code below ${insertUnder ? `line ${insertUnder}` : 'her cursor'}.`;
        },
    }),
    undo: defineAction({
        name: 'undo',
        description: 'Undo the last change made to the active document.'
            + ' Where your cursor will be moved cannot be determined.' // It will move to the real cursor but thats kinda useless for her to know
            + ' If this doesn\'t work, tell insert_turtle_here to focus your VS Code window.',
        category: CATEGORY_EDITING,
        handler: handleUndo,
        cancelEvents: commonCancelEvents,
        validators: {
            sync: [checkCurrentFile],
        },
        promptGenerator: 'undo the last action.',
    }),
    rewrite_all: defineAction({
        name: 'rewrite_all',
        description: 'Rewrite the entire contents of the file. Your cursor will be moved to the start of the file.',
        category: CATEGORY_EDITING,
        schema: z.object({
            content: z.string().meta({
                description: 'The content to rewrite the file with.',
            }),
        }),
        handler: (ctx) => returnHandleRewriteAll(ctx.data.params.content),
        preview: () => {
            const editor = vscode.window.activeTextEditor!;
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                editor.document.lineAt(editor.document.lineCount - 1).range.end,
            );
            const highlight = createPreviewHighlight();
            editor.setDecorations(highlight, [
                {
                    range: fullRange,
                    hoverMessage: `(Preview) ${NEURO.currentController} wants to rewrite this entire file. Good luck!`,
                },
            ]);
            return highlight;
        },
        cancelEvents: [cancelOnDidChangeActiveTextEditor],
        validators: {
            sync: [checkCurrentFile, createStringValidator(['content'])],
        },
        promptGenerator: (context) => {
            const actionData = context.data;
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `rewrite the entire file with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    }),
    rewrite_lines: defineAction({
        name: 'rewrite_lines',
        description: 'Rewrite everything in the specified line range.'
            + ' After rewriting, your cursor will be placed at the end of the last inserted line.'
            + ' Line numbers are one-based.',
        category: CATEGORY_EDITING,
        schema: z.object({
            lineRange: _LINE_RANGE_SCHEMA,
            content: z.string().meta({
                description: 'The content to replace the selected range of lines with.',
            }),
        }),
        handler: ({ data: { params } }) => returnHandleRewriteLines(params.lineRange, params.content),
        preview: (context) => previewLineHighlights(context.data.params.lineRange, 'rewrite these lines.'),
        cancelEvents: commonCancelEvents,
        validators: {
            sync: [checkCurrentFile, createLineRangeValidator(), createStringValidator(['content'])],
        },
        promptGenerator: (context) => {
            const actionData = context.data;
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `rewrite lines ${actionData.params.lineRange.startLine}-${actionData.params.lineRange.endLine} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    }),
    delete_lines: defineAction({
        name: 'delete_lines',
        description: 'Delete everything in the specified line range.'
            + ' After deleting, your cursor will be placed at the end of the line before the deleted lines, if possible.'
            + ' Line numbers are one-based.',
        category: CATEGORY_EDITING,
        schema: _LINE_RANGE_SCHEMA.meta({
            description: undefined,
        }),
        handler: (ctx) => returnHandleDeleteLines(ctx.data.params.startLine, ctx.data.params.endLine),
        preview: (context) => previewLineHighlights(context.data.params, 'delete these lines.'),
        cancelEvents: commonCancelEvents,
        validators: {
            sync: [checkCurrentFile, createLineRangeValidator()],
        },
        promptGenerator: (context) => {
            return `delete lines ${context.data.params.startLine}-${context.data.params.endLine}.`;
        },
    }),
    replace_user_selection: defineAction({
        name: 'replace_user_selection',
        description: 'Replace insert_turtle_here\'s current selection with the provided text.'
            + ' If insert_turtle_here has no selection, this will insert the text at insert_turtle_here\'s current cursor position.'
            + ' After replacing/inserting, your cursor will be placed at the end of the inserted text.'
            + ' If "requireSelectionUnchanged" is true, the action will be automatically cancelled if insert_turtle_here\'s selection changes or has changed since it was last obtained.',
        category: CATEGORY_EDITING,
        schema: z.object({
            content: z.string().meta({
                description: 'The content to replace insert_turtle_here\'s selection with.',
            }),
            requireSelectionUnchanged: z.boolean().meta({
                description: 'Does your change require that insert_turtle_here keeps his selection unchanged?',
            }),
        }),
        handler: ({ data: { params } }) => returnHandleReplaceUserSelection(params.content),
        // No preview effect needed, intended preview effect is the highlighted text
        cancelEvents: [
            ...commonCancelEvents,
            (context) => {
                if (context.data.params.requireSelectionUnchanged)
                    return new RCECancelEvent({
                        reason: `${CONNECTION.userName}'s selection changed.`,
                        logReason: `${CONNECTION.userName}'s selection changed and requireSelectionUnchanged is set to true.`,
                        events: [[vscode.window.onDidChangeTextEditorSelection, null]],
                    });
                return null;
            },
        ],
        validators: {
            sync: [
                checkCurrentFile,
                createStringValidator(['content']),
                (context) => { // Validate that the selection is known and unchanged if required
                    if (!context.data.params.requireSelectionUnchanged)
                        return actionValidationAccept();
                    if (NEURO.lastKnownUserSelection === null || NEURO.lastKnownUserSelection !== vscode.window.activeTextEditor?.selection)
                        return actionValidationFailure(`${CONNECTION.userName}'s selection has changed since it was last obtained.`);
                    return actionValidationAccept();
                },
            ],
        },
        promptGenerator: (context) => {
            const actionData = context.data;
            const lineCount = actionData.params.content.trim().split('\n').length;
            return `replace your current selection with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        },
    }),
    edit_with_diff: defineAction({
        name: 'edit_with_diff',
        description: 'Write a diff patch to apply to the file.' +
            ' The diff patch must be written in a pseudo-search-replace-diff format.' +
            ' `>>>>>> SEARCH` and `<<<<<< REPLACE` will be used to tell what to search and what to replace,' +
            ' with `======` delimiting between the two.' +
            ' `>>>>>> SEARCH`, `<<<<<< REPLACE` and `======` must each be on a separate line, and be the only content on said lines.' +
            ' You can only specify **one** search/replace pair per diff patch.*' +
            ' Read the schema for an example.',
        category: CATEGORY_EDITING,
        // schema: {
        //     type: 'object',
        //     properties: {
        //         diff: { type: 'string', description: 'The diff patch to apply. Must follow a pseudo-search-replace-diff format.', examples: ['>>>>>> SEARCH\ndef turtle():\n    return "Vedal"\n======\ndef turtle():\n    return "insert_turtle_here"\n<<<<<< REPLACE'] },
        //         moveCursor: { type: 'boolean', description: 'Whether or not to move the cursor to the end of the patch replacement.', default: false },
        //     },
        //     required: ['diff'],
        //     additionalProperties: false,
        // },
        schema: z.object({
            diff: z.string().meta({
                description: 'The diff patch to apply. Must follow a pseudo-search-replace-diff format.',
                examples: ['>>>>>> SEARCH\ndef turtle():\n    return "Vedal"\n======\ndef turtle():\n    return "insert_turtle_here"\n<<<<<< REPLACE'],
            }),
            moveCursor: z.boolean().meta({
                description: 'Whether or not to move the cursor to the end of the patch replacement.',
            }).optional(),
        }),
        handler: ({ data: { params } }) => returnHandleDiffPatch(params.diff, params.moveCursor),
        // TODO: I'm not sure if or how this action would have a preview effect, like would it work if a big highlight range was added to the targted text?
        validators: {
            sync: [checkCurrentFile, (context) => {
                const patch = parseDiffPatch(context.data.params.diff);
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
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context) => {
            const patch = parseDiffPatch(context.data.params.diff)!;
            const { linesAdded, linesRemoved } = countLineDifferences(patch.search, patch.replace);
            return `apply a diff patch ( +${linesAdded} | -${linesRemoved} ).`;
        },
    }),
};

export function addEditingActions() {
    addActions([
        editFileActions.insert_text,
        editFileActions.insert_lines,
        editFileActions.undo,
        editFileActions.rewrite_all,
        editFileActions.rewrite_lines,
        editFileActions.delete_lines,
        editFileActions.replace_user_selection,
        editFileActions.edit_with_diff,
    ]);
}

function returnHandleInsertText(text: string, position?: { line: number, column: number, type: 'relative' | 'absolute' }) {
    const cursor = getVirtualCursor()!;
    let line: number;
    let column: number;

    if (!position) position = {
        line: cursor.line + 1,
        column: cursor.character + 1,
        type: 'absolute',
    };

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

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

    return vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Inserting text into document');
            const document = vscode.window.activeTextEditor!.document;
            const insertEnd = getVirtualCursor()!;
            showDiffRanges(vscode.window.activeTextEditor!, {
                range: new vscode.Range(insertStart, insertEnd),
                type: DiffRangeType.Added,
            });
            const cursorContext = getPositionContext(document, { cursorPosition: insertEnd, position: insertStart, position2: insertEnd });
            return actionHandlerSuccess(`Inserted text into document and moved your cursor\n\n${formatContext(cursorContext)}`, `Inserted ${text.length} characters`);
        }
        else {
            return actionHandlerFailure('Failed to insert text', 'Failed to insert text');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleInsertText(context: RCEContext<{ text: string; position?: { line: number, column: number, type: 'relative' | 'absolute' } }>): RCEHandlerReturns {
    const { data: actionData } = context;
    const text: string = actionData.params!.text;
    const position = actionData.params!.position;
    return returnHandleInsertText(text, position);
}

function returnHandleInsertLines(text: string, insertUnder?: number) {
    /**
     * The current implementation is a lazy one of just appending a newline and pasting the text in
     * We want to allow specification of the line to insert under, with the default set to the current cursor location
     */
    const cursor = getVirtualCursor()!;
    text = '\n' + text;
    let insertLocation: number = insertUnder !== undefined ? insertUnder - 1 : cursor.line;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

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

    return vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Inserting text lines into document');
            const document = vscode.window.activeTextEditor!.document;
            const insertEnd = getVirtualCursor()!;
            showDiffRanges(vscode.window.activeTextEditor!, {
                range: new vscode.Range(insertStart, insertEnd),
                type: DiffRangeType.Added,
            });
            const cursorContext = getPositionContext(document, { cursorPosition: insertEnd, position: insertStart, position2: insertEnd });
            return actionHandlerSuccess(`Inserted text lines into document\n\n${formatContext(cursorContext)}`, `Inserted ${text.split('\n').length} lines`);
        }
        else {
            return actionHandlerFailure('Failed to insert text lines', 'Failed to insert text lines');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleInsertLines(context: RCEContext<{ text: string; insertUnder: number; }>): RCEHandlerReturns {
    const { data: actionData } = context;
    return returnHandleInsertLines(actionData.params!.text, actionData.params!.insertUnder);
}

export function handleUndo(): RCEHandlerReturns {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    clearDecorations(vscode.window.activeTextEditor!);

    return vscode.commands.executeCommand('undo').then(
        () => {
            logOutput('INFO', 'Undoing last edit in document');
            // We don't keep track of the virtual cursor position in the undo stack, so we reset it to the real cursor position
            const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
            setVirtualCursor(vscode.window.activeTextEditor!.selection.active);
            return actionHandlerSuccess(`Undid last action in document\n\n${formatContext(cursorContext)}`, 'Undid last action');
        },
        (erm) => {
            logOutput('ERROR', `Failed to undo last action: ${erm}`);
            return actionHandlerFailure('Failed to undo last action', 'Failed to undo');
        },
    );
}

function returnHandleRewriteAll(content: string) {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const originalText = document.getText();

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
    );
    edit.replace(document.uri, fullRange, content);

    return vscode.workspace.applyEdit(edit).then(success => {
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
            return actionHandlerSuccess(`Rewrote entire file ${relativePath} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content\n\n${formatContext(cursorContext)}`, `Rewrote entire file with ${lineCount} lines`);
        } else {
            return actionHandlerFailure('Failed to rewrite document content', 'Failed to rewrite document');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleRewriteAll(context: RCEContext<{ content: string }>): RCEHandlerReturns {
    const { data: actionData } = context;

    return returnHandleRewriteAll(actionData.params!.content);
}

function returnHandleDeleteLines(startLine: number, endLine: number) {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const edit = new vscode.WorkspaceEdit();
    const startPosition = new vscode.Position(startLine - 1, 0);
    const endLineZero = endLine - 1;
    // Include the trailing newline by ending at the start of the line after endLine when possible
    const endPosition = endLineZero + 1 < document.lineCount
        ? new vscode.Position(endLineZero + 1, 0)
        : new vscode.Position(endLineZero, document.lineAt(endLineZero).text.length);
    const originalText = document.getText(new vscode.Range(startPosition, endPosition));
    edit.delete(document.uri, new vscode.Range(startPosition, endPosition));

    return vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri);
            // Defer cursor update until edits have fully settled
            const documentPost = vscode.window.activeTextEditor!.document;
            let cursorContext: NeuroPositionContext;
            if (startLine <= 1) {
                // If deleting from the first line, place cursor at start of new first line
                const cursorPosition = new vscode.Position(0, 0);
                setVirtualCursor(cursorPosition);
                cursorContext = getPositionContext(documentPost, cursorPosition);
                logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to start of line 1`);
            } else {
                // Move cursor to end of line before the deleted lines
                const targetLineZero = Math.max(0, startLine - 2); // 0-based line before deleted block
                if (targetLineZero < documentPost.lineCount) {
                    const cursorPosition = new vscode.Position(targetLineZero, documentPost.lineAt(targetLineZero).text.length);
                    setVirtualCursor(cursorPosition);
                    cursorContext = getPositionContext(documentPost, cursorPosition);
                    logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to end of line ${targetLineZero + 1}`);
                } else if (documentPost.lineCount > 0) {
                    // Fallback: place cursor at the end of the document
                    const cursorPosition = new vscode.Position(documentPost.lineCount - 1, documentPost.lineAt(documentPost.lineCount - 1).text.length);
                    setVirtualCursor(cursorPosition);
                    cursorContext = getPositionContext(documentPost, cursorPosition);
                    logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to end of document`);
                } else {
                    // Empty document edge case
                    const cursorPosition = new vscode.Position(0, 0);
                    setVirtualCursor(cursorPosition);
                    cursorContext = getPositionContext(documentPost, cursorPosition);
                    logOutput('INFO', `Deleted lines ${startLine}-${endLine} and moved cursor to start of document`);
                }
            }

            showDiffRanges(vscode.window.activeTextEditor!, {
                range: new vscode.Range(startPosition, startPosition),
                type: DiffRangeType.Removed,
                removedText: originalText,
            });
            return actionHandlerSuccess(`Deleted lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`, `Deleted lines ${startLine}-${endLine}`);
        } else {
            return actionHandlerFailure('Failed to delete lines', 'Failed to delete lines');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleDeleteLines(context: RCEContext<{ startLine: number; endLine: number; }>): RCEHandlerReturns {
    const { data: actionData } = context;
    const startLine = actionData.params!.startLine;
    const endLine = actionData.params!.endLine;

    return returnHandleDeleteLines(startLine, endLine);
}

function returnHandleRewriteLines(lineRange: LineRange, content: string) {
    const startLine = lineRange.startLine;
    const endLine = lineRange.endLine;

    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const edit = new vscode.WorkspaceEdit();
    const startPosition = new vscode.Position(startLine - 1, 0);
    const endLineZero = endLine - 1;
    // Preserve the following line's newline by ending at the end of endLine
    const endPosition = document.lineAt(endLineZero).range.end;
    const originalText = document.getText(new vscode.Range(startPosition, endPosition));
    edit.replace(document.uri, new vscode.Range(startPosition, endPosition), content);

    return vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const relativePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri);
            // Defer cursor update until edits have fully settled
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
            return actionHandlerSuccess(`Rewrote lines ${startLine}-${endLine} in file ${relativePath}\n\n${formatContext(cursorContext)}`, `Rewrote lines ${startLine}-${endLine}`);
        } else {
            return actionHandlerFailure('Failed to rewrite lines', 'Failed to rewrite lines');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleRewriteLines(context: RCEContext<{ lineRange: LineRange, content: string }>): RCEHandlerReturns {
    const { data: actionData } = context;
    const { lineRange, content } = actionData.params!;

    return returnHandleRewriteLines(lineRange, content);
}

function returnHandleDiffPatch(diff: string, moveCursor = false) {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    // Parse the diff patch
    const parsedDiff = parseDiffPatch(diff)!;
    parsedDiff.search = filterFileContents(parsedDiff.search);
    parsedDiff.replace = filterFileContents(parsedDiff.replace);
    const { search, replace } = parsedDiff;

    // Find the search text in the document
    const filteredText = filterFileContents(document.getText());
    const searchIndex = filteredText.indexOf(search);
    if (searchIndex === -1) {
        return actionHandlerFailure(`Search text not found in the document:\n\n${getFence(search)}\n${search}\n${getFence(search)}`, 'Search text not found');
    }
    const startPosition = positionFromIndex(filteredText, searchIndex);
    const endPosition = positionFromIndex(filteredText, searchIndex + search.length);

    // Check for multiple occurrences
    const secondOccurrence = filteredText.indexOf(search, searchIndex + 1);
    if (secondOccurrence !== -1) {
        return actionHandlerFailure(`Multiple occurrences of search text found. Please use a longer search term for a unique match:\n\n${getFence(search)}\n${search}\n${getFence(search)}`, 'Multiple occurrences found');
    }

    // Perform the replacement
    const range = new vscode.Range(startPosition, endPosition);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, replace);

    return vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            logOutput('INFO', 'Applied diff patch to document');

            const newEndPosition = positionFromIndex(filteredText, searchIndex + replace.length);
            let cursorPosition: vscode.Position;

            if (moveCursor === true) {
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

            const { linesAdded, linesRemoved } = countLineDifferences(parsedDiff.search, parsedDiff.replace);

            return actionHandlerSuccess(`Applied diff patch successfully\n\n${formatContext(cursorContext)}`, `Applied diff patch [+${linesAdded} | -${linesRemoved}]`);
        } else {
            return actionHandlerFailure('Failed to apply diff patch', 'Failed to apply diff patch');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleDiffPatch(context: RCEContext<{ diff: string; moveCursor?: boolean }>): RCEHandlerReturns {
    const { data: actionData } = context;
    return returnHandleDiffPatch(actionData.params!.diff, actionData.params!.moveCursor);
}

function returnHandleReplaceUserSelection(content: string) {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (editor === undefined || document === undefined) {
        return actionHandlerFailure(CONTEXT_NO_ACTIVE_DOCUMENT, STATUS_NO_ACTIVE_DOCUMENT);
    }
    if (!isPathNeuroSafe(document.fileName)) {
        return actionHandlerFailure(CONTEXT_NO_ACCESS, STATUS_NO_ACCESS);
    }

    const edit = new vscode.WorkspaceEdit();
    const selection = editor.selection;
    const originalText = filterFileContents(document.getText(selection));
    edit.replace(document.uri, selection, content);

    setVirtualCursor(selection.end);

    return vscode.workspace.applyEdit(edit).then(success => {
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

            NEURO.lastKnownUserSelection = editor.selection;
            return actionHandlerSuccess(`Replaced ${CONNECTION.userName}'s selection in the document\n\n${formatContext(cursorContext)}`, 'Replaced user selection');
        } else {
            return actionHandlerFailure('Failed to replace selection', 'Failed to replace selection');
        }
    });
}

/** @deprecated Functions should now be inlined */
export function handleReplaceUserSelection(context: RCEContext<{ content: string; }>): RCEHandlerReturns {
    const { data: actionData } = context;
    return returnHandleReplaceUserSelection(actionData.params!.content);
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
    let description: string;

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

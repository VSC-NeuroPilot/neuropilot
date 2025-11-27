import type * as vscode from 'vscode';

export type CursorPositionContextStyle = 'off' | 'inline' | 'lineAndColumn' | 'both';

export interface NeuroPositionContext {
    /** The context before the cursor, or the entire context if the cursor is not defined. */
    contextBefore: string;
    /** The context after the range, or an empty string if the cursor is not defined. */
    contextAfter: string;
    /** The zero-based line where {@link contextBefore} starts. */
    startLine: number;
    /** The zero-based line where {@link contextAfter} ends. */
    endLine: number;
    /** The number of total lines in the file. */
    totalLines: number;
    /** `true` if the cursor is defined and inside the context, `false` otherwise. */
    cursorDefined: boolean;
}

export interface NeuroPositionContextOptions {
    /** The position of the cursor in the document. */
    cursorPosition?: vscode.Position;
    /** The start of the range around which to get the context. Defaults to the start of the document if not provided. */
    position?: vscode.Position;
    /** The end of the range around which to get the context. If not provided, defaults to {@link position}, or the end of the document if {@link position} is not provided. */
    position2?: vscode.Position;
}

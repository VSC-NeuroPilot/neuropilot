import * as vscode from 'vscode';
import { RCECancelEvent } from './utils';
import { CONNECTION } from '../config';

const _onDidMoveCursor = new vscode.EventEmitter<vscode.Position | null | undefined>();
const _onDidMoveCursorEvent = _onDidMoveCursor.event;
export const moveCursorEmitterDiposable = vscode.Disposable.from(_onDidMoveCursor);

/**
 * Fires the cursor position changed event.
 * @param position The new cursor position, or null if the cursor is not on the page, or undefined if the text editor does not exist.
 */
export function fireCursorPositionChangedEvent(position: vscode.Position | null | undefined) {
    // Fire the event
    _onDidMoveCursor.fire(position);
}

export function createCursorPositionChangedEvent() {
    return new RCECancelEvent({
        reason: 'your cursor position changed.',
        logReason: (_data) => `${CONNECTION.nameOfAPI}'s cursor position changed.`,
        events: [
            [_onDidMoveCursorEvent, null],
        ],
    });
}

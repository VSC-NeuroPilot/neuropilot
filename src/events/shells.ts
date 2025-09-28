import * as vscode from 'vscode';
import { RCECancelEvent } from './utils';
import { NEURO } from '../constants';

export function notifyOnTerminalClose(terminal: string): RCECancelEvent | null {
    const shell = NEURO.terminalRegistry.get(terminal);
    if (!shell) return null;

    let closeListener: (() => void) | null = null;

    const event = new RCECancelEvent({
        reason: `the terminal ${terminal} was closed.`,
    });

    // Store the original fire method
    const originalFire = event.fire.bind(event);

    // Override the fire method to clean up the Node.js listener
    event.fire = (data: never) => {
        if (closeListener) {
            shell.shellProcess!.removeListener('close', closeListener);
            closeListener = null;
        }
        originalFire(data);
    };

    // Create and add the listener
    closeListener = () => event.fire(undefined);
    shell.shellProcess!.on('close', closeListener);

    // Also override the disposable to clean up if disposed without firing
    const originalDisposable = event.disposable;
    Object.defineProperty(event, 'disposable', {
        value: new vscode.Disposable(() => {
            if (closeListener) {
                shell.shellProcess!.removeListener('close', closeListener);
                closeListener = null;
            }
            originalDisposable.dispose();
        }),
        writable: false,
        enumerable: true,
        configurable: false,
    });

    return event;
}

export function notifyOnTaskFinish(): RCECancelEvent {
    return new RCECancelEvent({
        reason: 'the task finished.',
        events: [
            [vscode.tasks.onDidEndTask, null],
        ],
    });
}

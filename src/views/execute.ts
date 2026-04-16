import * as vscode from 'vscode';
import assert from 'assert';
import type { ActionsEventData, ActionStatus } from '@vsc-neuropilot/api-types';

import { BaseWebviewViewProvider, Message } from './base';
import { onDidAttemptAction } from '../events/actions';
import { NEURO } from '@/constants';

export interface ExecuteResult {
    status: ActionStatus;
    action: string;
    message?: string;
    executionId: string;
    sessionId: string;
}

export interface ExecutionHistoryItem extends ExecuteResult {
    timestamp: number;
}

export type ExecuteViewProviderMessage = {
    type: 'executionResult';
    result: ExecutionHistoryItem;
} | {
    type: 'updateStatus';
    executionId: string;
    status: ActionStatus;
    message?: string;
} | {
    type: 'currentSession';
    sessionId: string;
} | {
    type: 'addHistoryItem';
    item: ExecutionHistoryItem;
};

export class ExecuteViewProvider extends BaseWebviewViewProvider<Message, ExecuteViewProviderMessage> {
    private static readonly sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    public static readonly viewId: string = 'neuropilot.executionView';
    private static readonly mementoKey = 'bufferedResults';
    private bufferedResults: ExecutionHistoryItem[] = [];
    private readonly maxBufferSize: number = 50; // likely adjustable in the future, if set to 0 it will disable buffering, if set to -1 it will allow unlimited buffer size.

    constructor() {
        super('execute/main.js', ['execute/style.css']);

        assert(NEURO.context);

        // Restore buffered results from previous session
        const stored = NEURO.context.globalState.get<ExecutionHistoryItem[]>(ExecuteViewProvider.mementoKey);
        if (stored && Array.isArray(stored)) {
            this.bufferedResults = stored.slice(0, this.maxBufferSize);
        }

        // Subscribe to action events immediately, not just when view is ready
        NEURO.context.subscriptions.push(
            onDidAttemptAction((data: ActionsEventData) => {
                this.sendExecutionResult({
                    ...data,
                    sessionId: ExecuteViewProvider.sessionId,
                });
            }),
        );
    }

    protected handleMessage(_message: Message): void { }

    protected onViewReady(): void {
        // Send current session ID to webview
        this.postMessage({
            type: 'currentSession',
            sessionId: ExecuteViewProvider.sessionId,
        });

        // Subscribe to visibility changes to flush buffer when view is opened
        NEURO.context!.subscriptions.push(
            this._view!.onDidChangeVisibility(() => {
                if (this._view!.visible) {
                    this.flushBufferedResults();
                }
            }),
        );

        // Flush buffered results to the now-ready webview
        this.flushBufferedResults();
    }

    /**
     * Sends an execution result to the execute view.
     * The webview will determine whether to create a new entry or update an existing one.
     * If the view is not ready, results are buffered and sent when it becomes ready.
     */
    public sendExecutionResult(result: ExecuteResult) {
        const historyItem: ExecutionHistoryItem = {
            ...result,
            timestamp: Date.now(),
        };

        if (!this._view?.visible) {
            // Check if this execution already exists in the buffer
            const existingIndex = this.bufferedResults.findIndex(
                item => item.executionId === result.executionId && item.sessionId === result.sessionId,
            );

            if (existingIndex !== -1) {
                // Update existing buffered item
                this.bufferedResults[existingIndex] = {
                    ...this.bufferedResults[existingIndex],
                    status: result.status,
                    message: result.message,
                };
            } else {
                // Add new buffered item
                this.bufferedResults.push(historyItem);
                // Keep buffer size manageable
                if (this.maxBufferSize !== -1 && this.bufferedResults.length > this.maxBufferSize) {
                    this.bufferedResults.shift(); // Remove oldest item
                }
            }
            return;
        }

        this.postMessage({
            type: 'executionResult',
            result: historyItem,
        });
    }

    /**
     * Flushes all buffered results to the webview.
     */
    private flushBufferedResults(): void {
        if (!this._view || this.bufferedResults.length === 0) {
            return;
        }

        for (const result of this.bufferedResults) {
            this.postMessage({
                type: 'executionResult',
                result,
            });
        }
        this.bufferedResults = [];
        // Clear from memento since items are now in the webview
        NEURO.context!.globalState.update(ExecuteViewProvider.mementoKey, undefined);
    }

    /**
     * Persists the buffered results to extension storage.
     */
    private persistBuffer(): void {
        NEURO.context!.globalState.update(ExecuteViewProvider.mementoKey, this.bufferedResults);
    }

    /**
     * Saves buffered results before deactivation.
     * Should be called from the extension's deactivate function.
     */
    public saveBufferBeforeDeactivation(): void {
        if (this.bufferedResults.length > 0) {
            this.persistBuffer();
        }
    }

    /**
     * Adds a custom history item to the execution view.
     * This is primarily for development/testing purposes.
     */
    public addCustomHistoryItem(item: ExecutionHistoryItem) {
        if (!this._view) {
            return;
        }

        this.postMessage({
            type: 'addHistoryItem',
            item,
        });
    }
}

/**
 * Dev command to add a custom history item for testing purposes.
 */
export async function addCustomExecutionHistoryItem(executeViewProvider: ExecuteViewProvider) {
    // Get action name
    const action = await vscode.window.showInputBox({
        prompt: 'Action name',
        placeHolder: 'e.g., place_cursor',
        validateInput: (value) => value.trim() ? null : 'Action name cannot be empty',
    });
    if (!action) return;

    // Get status
    const statusOptions: { label: string; value: ActionStatus }[] = [
        { label: 'Pending', value: 'pending' },
        { label: 'Success', value: 'success' },
        { label: 'Failure', value: 'failure' },
        { label: 'Denied', value: 'denied' },
        { label: 'Schema', value: 'schema' },
        { label: 'Timeout', value: 'timeout' },
        { label: 'Exception', value: 'exception' },
        { label: 'Cancelled', value: 'cancelled' },
    ];
    const selectedStatus = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: 'Select status',
    });
    if (!selectedStatus) return;

    // Get message (optional)
    const message = await vscode.window.showInputBox({
        prompt: 'Status message (optional)',
        placeHolder: 'e.g., Cursor placed at line 42',
    });

    // Get timestamp offset
    const timeOffset = await vscode.window.showInputBox({
        prompt: 'Time offset from now in minutes (negative for past, positive for future)',
        placeHolder: 'e.g., -1440 for 1 day ago, 0 for now',
        value: '0',
        validateInput: (value) => {
            const num = parseFloat(value);
            return !isNaN(num) ? null : 'Must be a valid number';
        },
    });
    if (timeOffset === undefined) return;

    const timestamp = Date.now() + parseFloat(timeOffset) * 60 * 1000;

    // Create the history item
    const historyItem: ExecutionHistoryItem = {
        action,
        status: selectedStatus.value,
        message: message || undefined,
        executionId: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sessionId: `dev_session_${Date.now()}`,
        timestamp,
    };

    executeViewProvider.addCustomHistoryItem(historyItem);
    vscode.window.showInformationMessage(`Added custom history item: ${action} (${selectedStatus.label})`);
}

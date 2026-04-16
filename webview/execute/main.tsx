import type { ActionStatus } from '@vsc-neuropilot/api-types';

import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ExecuteViewProviderMessage, ExecutionHistoryItem } from '@/views/execute';

interface State {
    history: ExecutionHistoryItem[];
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString();
    }

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function ExecutionWindow() {
    const vscode = useMemo(acquireVsCodeApi<State>, []);
    const oldState = useMemo(vscode.getState, [vscode]);
    const [history, setHistory] = useState<ExecutionHistoryItem[]>(oldState?.history ?? []);

    // Save state whenever it changes
    useEffect(() => {
        vscode.setState({ history });
    }, [history]);

    // Listen for messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent<ExecuteViewProviderMessage>) => {
            const message = event.data;
            if (message.type === 'currentSession') {
                // Mark any pending items from previous sessions as failed
                setHistory(prev => prev.map(item =>
                    item.status === 'pending' && item.sessionId !== message.sessionId
                        ? { ...item, status: 'failure' as const, message: 'Extension deactivated before action could be processed fully' }
                        : item,
                ));
            } else if (message.type === 'executionResult') {
                setHistory(prev => {
                    // Check if execution ID already exists
                    // Only match items from the current session to avoid updating old items
                    const existingIndex = prev.findIndex(item =>
                        item.executionId === message.result.executionId &&
                        item.sessionId === message.result.sessionId,
                    );

                    if (existingIndex !== -1) {
                        // Update existing entry - only if it's from the same session
                        const updated = [...prev];
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            status: message.result.status,
                            message: message.result.message,
                        };
                        return updated;
                    } else {
                        // Add new entry at the beginning
                        return [message.result, ...prev].slice(0, 100); // Keep last 100 items
                    }
                });
            } else if (message.type === 'addHistoryItem') {
                // Add a custom history item (for dev testing)
                setHistory(prev => [message.item, ...prev].slice(0, 100));
            }
        };

        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, []);

    const clearHistory = () => {
        setHistory([]);
    };

    const historyItemMappings: Record<ActionStatus, string> = {
        failure: 'codicon-error',
        success: 'codicon-pass',
        pending: 'codicon-loading codicon-modifier-spin',
        denied: 'codicon-skip',
        schema: 'codicon-bracket-error',
        timeout: 'codicon-clockface',
        exception: 'codicon-run-errors',
        cancelled: 'codicon-bell-dot',
    } as const;

    // Sort history by timestamp (oldest to newest)
    const sortedHistory = useMemo(() => {
        return [...history].sort((a, b) => b.timestamp - a.timestamp);
    }, [history]);

    return (
        <div class="execution-container">
            <div class="header">
                <h3>Action Execution History</h3>
                {history.length > 0 &&
                    <button class="clear-button" onClick={clearHistory} title="Clear history">
                        <i class="codicon codicon-clear-all"></i>
                    </button>
                }
            </div>
            {history.length === 0 ?
                <div class="empty-state">
                    <i class="codicon codicon-info"></i>
                    <p>No actions executed yet</p>
                </div>
                :
                <div class="history-list">
                    {sortedHistory.map((item, index) =>
                        <div
                            key={`${item.executionId}-${index}`}
                            class={`history-item ${item.status}`}
                        >
                            <div class="item-header">
                                <i class={`codicon ${historyItemMappings[item.status]}`}></i>
                                <span class="action-name">{item.action}</span>
                                <span class="timestamp">{formatTime(item.timestamp)}</span>
                            </div>
                            {item.message &&
                                <div class="item-message">{item.message}</div>
                            }
                        </div>,
                    )}
                </div>
            }
        </div>
    );
}

render(<ExecutionWindow />, document.getElementById('root')!);

import type { ActionStatus } from '../actions';

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
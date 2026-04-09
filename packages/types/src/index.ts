import type { RCECancelEvent } from './actions/classes';
import type { ActionHandlerResult, ActionValidationResult, RCEAction } from './actions/types';
import type { CompanionAPI } from './companions/register';

export interface NeuroPilotAPI {
    /**
     * @example new Companion()
     */
    Companion: typeof CompanionAPI;
    utils: {
        actionValidation: {
            success(message?: string, historyNote?: string): ActionValidationResult;
            failure(message: string, historyNote?: string): ActionValidationResult;
            retry(message: string, historyNote?: string): ActionValidationResult;
        };
        actionHandler: {
            success(message?: string, historyNote?: string): ActionHandlerResult;
            failure(message: string, historyNote?: string): ActionHandlerResult;
            retry(message: string, historyNote?: string): ActionHandlerResult;
        };
        actionsListing: {
            getActions(action?: string | string[]): ItselfOrArray<RCEAction & { source?: string; }> | undefined
        };
        diffs: {
            calculateDiffs(): void; // TODO: implement types
        };
        /**
         * 
         * @param path The path to the file.
         */
        isPathNeuroSafe(path: string): boolean;
        /**
         * @example new CancelEvent()
         */
        CancelEvent: typeof RCECancelEvent;
    };
}

type ItselfOrArray<T> = T | T[];

export * from './actions';
export * from './companions';
export { ActionForcePriorityEnum } from 'neuro-game-sdk';

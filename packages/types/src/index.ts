import type { RCECancelEvent } from './actions/classes';
import type { ActionHandlerResult, ActionValidationResult } from './actions/types';
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
        /**
         * @example new CancelEvent()
         */
        CancelEvent: typeof RCECancelEvent;
    };
}

export * from './actions';
export type * from './companions';
export { ActionForcePriorityEnum } from 'neuro-game-sdk';

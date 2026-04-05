import type { RCECancelEventInitializer, RCECancelEvent } from './actions/classes';
import type { ActionHandlerResult, ActionValidationResult } from './actions/types';
import { CompanionAPI } from './companions/register';

/**
 * Public constructor shape for cancel events exposed through the API.
 */
export type CancelEventConstructor = new <T = unknown>(init?: RCECancelEventInitializer<T>) => RCECancelEvent<T>;

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
        CancelEvent: CancelEventConstructor;
    };
}

export * from './actions';
export * from './companions/register.d';
export { ActionForcePriorityEnum } from 'neuro-game-sdk';

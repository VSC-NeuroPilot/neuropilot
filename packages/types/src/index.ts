import type { RCECancelEvent } from './actions/classes';
import type { ActionHandlerResult, ActionValidationResult, RCEAction } from './actions/types';
import type { CompanionAPI } from './companions/register';

export interface NeuroPilotAPI {
    /**
     * Register your companion extension by creating a new object from this class.
     * See {@link CompanionAPI} for the API surface it exposes.
     */
    Companion: typeof CompanionAPI;
    /**
     * Public, useful utilities you might want to use in your extension.
     */
    utils: {
        /**
         * Utilities for generating action validation messages
         */
        actionValidation: {
            /**
             * Function to return an object that indicates handler success.
             * @param message The message that will be sent to Neuro
             * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
             * @returns {ActionHandlerResult} An object with a successful handler result
            */
            success(message?: string, historyNote?: string): ActionValidationResult;

            /**
             * Function to return an object that indicates handler failure.
             * @param message The message that will be sent to Neuro
             * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
             * @returns {ActionHandlerResult} An object with a failed handler result
             */
            failure(message: string, historyNote?: string): ActionValidationResult;

            /**
             * Function to return an object that indicates handler failure.
             * @param message The message that will be sent to Neuro
             * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
             * @returns {ActionHandlerResult} An object with a failed handler result
             */
            retry(message: string, historyNote?: string): ActionValidationResult;
        };
        /**
         * Utililties for generating action handler messages
         */
        actionHandler: {
            /**
             * Create a successful action result.
             * This should be used if all parameters have been parsed correctly.
             * @param message An optional message to send to Neuro.
             * @param historyNote A note for the history panel.
             * @returns A successful action result.
             */
            success(message?: string, historyNote?: string): ActionHandlerResult;

            /**
             * Create an action result with the specified message.
             * This should be used if the action failed, but should not be retried, e.g.
             * if the source of the error is out of Neuro's control or to prevent a retry
             * loop in case the action is not applicable in the current state.
             * @param message The message to send to Neuro. This should explain, if possible, why the action failed. If omitted, will just send "Action failed.".
             * @param historyNote A note for the history panel.
             * @returns A successful action result with the specified message.
             */
            failure(message: string, historyNote?: string): ActionHandlerResult;

            /**
             * Create an action result that tells Neuro to retry the forced action.
             * @param message The message to send to Neuro. This should contain the information required to fix the mistake.
             * @param historyNote A note for the history panel.
             * @returns A failed action result with the specified message.
             */
            retry(message: string, historyNote?: string): ActionHandlerResult;
        };
        /**
         * Utilities for the action listing
         */
        actionsListing: {
            /**
             * Get an action or an array of actions.
             * @param action A string or array of strings of action names.
             * @returns An action (if a string was provided), undefined (if a string was provided and nothing was found), or an array of actions (if nothing or an array was provided)
             */
            getActions(action?: string | string[]): ItselfOrArray<RCEAction & { source?: string; }> | undefined
        };
        /**
         * Utilities for generating and applying diffs
         */
        diffs: {
            /**
             * @todo Documentation + types for how to use (cc: @Pasu4)
             * @param oldLines Old lines
             * @param newLines New lines
             */
            calculateDiffs(oldLines: string[], newLines: string[]): void; // TODO: implement types
            /**
             * @todo implement diff highlighting with the green/red/orange colours
             */
            applyDiffHighlighting(): void; // TODO: implement types
        };
        /**
         * Checks if a file is Neuro-safe, according to the rules the user has set in NeuroPilot's settings.
         * 
         * It is recommended that you use this to check file paths if your actions are accessing a file for any reason.
         * @param path The path to the file. This utility expects an *absolute* path.
         */
        isPathNeuroSafe(path: string): boolean;
        /**
         * Creates a new cancel event for RCE.
         * Make sure to properly dispose of them when you no longer need the cancel events.
         * If you are adding them to the cancel events array of an action, this should automatically be handled.
         */
        CancelEvent: typeof RCECancelEvent;
    };
}

type ItselfOrArray<T> = T | T[];

export * from './actions';
export * from './companions';
export { ActionForcePriorityEnum } from 'neuro-game-sdk';

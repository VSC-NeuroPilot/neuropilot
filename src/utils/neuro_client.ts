/**
 * Helper functions and types for interacting with the Neuro Game SDK.
 */

import { Action } from 'neuro-game-sdk';
import { RCEAction, ActionValidationResult, ActionHandlerResult } from '@vsc-neuropilot/api-types';

import { ACTIONS, Permission } from '@/config';
import { logOutput, OutputTag, turtleSafari } from '@/utils/misc';

//#region Action metadata & helpers

/**
 * Strips an action to the form expected by the API.
 * @param action The action to strip to its basic form.
 * @returns The action stripped to its basic form, without the handler and permissions.
 */
export function stripToAction(action: RCEAction): Action {
    let schema: Action['schema'];
    if (ACTIONS.experimentalSchemas && action.schemaFallback) {
        schema = action.schema;
    } else {
        schema = action.schemaFallback ?? action.schema ?? undefined;
    }
    return {
        name: action.name,
        description: turtleSafari(action.description),
        schema,
    };
}

/**
 * Strips an array of actions to the form expected by the API.
 * (Calls {@link stripToAction} for each action in the array.)
 * @param actions The actions to strip to their basic form.
 * @returns An array of actions stripped to their basic form, without the handler and permissions.
 */
export function stripToActions(actions: RCEAction[]): Action[] {
    return actions.map(stripToAction);
}

//#endregion

//#region Action validation helpers

/**
 * Create a successful action result.
 * This should be used if all parameters have been parsed correctly.
 * @param message An optional message to send to Neuro.
 * @returns A successful action result.
 */
export function actionValidationAccept(message?: string, historyNote?: string): ActionValidationResult {
    return {
        success: true,
        retry: false,
        message,
        historyNote,
    };
}

/**
 * Create an action result with the specified message.
 * This should be used if the action failed, but should not be retried, e.g.
 * if the source of the error is out of Neuro's control or to prevent a retry
 * loop in case the action is not applicable in the current state.
 * @param message The message to send to Neuro.
 * This should explain, if possible, why the action failed.
 * If omitted, will just send "Action failed.".
 * @param historyNote A note for the history panel. Will be changed to be required soon.
 * @returns A successful action result with the specified message.
 */
export function actionValidationFailure(message: string, historyNote?: string): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message);
    return {
        success: false,
        retry: false,
        message: message !== undefined ? `Action failed: ${message}` : 'Action failed.',
        historyNote,
    };
}

/**
 * Create an action result that tells Neuro to retry the forced action.
 * @param message The message to send to Neuro.
 * This should contain the information required to fix the mistake.
 * @returns A failed action result with the specified message.
 */
export function actionValidationRetry(message: string, historyNote?: string): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    return {
        success: false,
        retry: true,
        message: 'Action failed: ' + message,
        historyNote,
    };
}

//#endregion

//#region Action handler helpers

/**
 * Function to return an object that indicates handler success.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a successful handler result
 */
export function actionHandlerSuccess(message?: string, historyNote?: string): ActionHandlerResult {
    return {
        success: 'success',
        message,
        historyNote,
    };
}

/**
 * Function to return an object that indicates handler failure.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to failure will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a failed handler result
 */
export function actionHandlerFailure(message: string, historyNote?: string): ActionHandlerResult {
    logOutput('WARNING', 'Action failed: ' + message);
    return {
        success: 'failure',
        message,
        historyNote,
    };
}

/**
 * Function to return an object that indicates handler failure and to retry.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to failure will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a failed handler result
 */
export function actionHandlerRetry(message: string, historyNote?: string): ActionHandlerResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    return {
        success: 'retry',
        message,
        historyNote,
    };
}

//#endregion

//#region Old validation/handler result helpers

/**
 * Create an action result that tells Neuro that a required parameter is missing.
 * @param parameterName The name of the missing parameter.
 * @returns An failed action result with a message pointing out the missing parameter.
 * @deprecated Handled by the schema validator.
 */
export function actionResultMissingParameter(parameterName: string): ActionValidationResult {
    logOutput('WARNING', `Action failed: Missing required parameter "${parameterName}"`);
    return {
        success: false,
        message: `Action failed: Missing required parameter "${parameterName}"`,
    };
}

/**
 * @deprecated Handled by the schema validator.
 */
export function actionResultIncorrectType(parameterName: string, expectedType: string, actualType: string): ActionValidationResult {
    logOutput('WARNING', `Action failed: "${parameterName}" must be of type "${expectedType}", but got "${actualType}".`);
    return {
        success: false,
        message: `Action failed: "${parameterName}" must be of type "${expectedType}", but got "${actualType}".`,
    };
}

/**
 * Create an action result that tells Neuro that she doesn't have the required permission.
 * @param permission The permission Neuro doesn't have.
 * @returns A successful action result with a message pointing out the missing permission.
 * @deprecated Handled by the permissions checker component of RCE.
 */
export function actionValidationNoPermission(permission: Permission): ActionValidationResult {
    logOutput('WARNING', `Action failed: Neuro attempted to ${permission.infinitive}, but permission is disabled.`);
    return {
        success: true,
        message: `Action failed: You do not have permission to ${permission.infinitive}.`,
    };
}

/**
 * Create a context message that tells Neuro that she doesn't have permission to access a path.
 * Note that this does not send the context message.
 * @param path The path that was attempted to be accessed.
 * @returns A context message pointing out the missing permission.
 * @deprecated Should now be handled by validators.
 */
export function contextNoAccess(path: string): string {
    logOutput('WARNING', `Action failed: Neuro attempted to access "${path}", but permission is disabled.`);
    return 'Action failed: You do not have permission to access the requested location(s).';
}

/**
 * @deprecated Handled by the schema validator.
 */
export function actionResultEnumFailure<T>(parameterName: string, validValues: T[], value: T): ActionValidationResult {
    logOutput('WARNING', `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`);
    return {
        success: false,
        message: `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`,
    };
}

/**
 * Create a context message that tells Neuro that the action failed and logs this.
 * Also logs the message to the console.
 * Note that this does not send the context message.
 * @param message The message to format.
 * @param tag The tag to use for the log output.
 * This should explain, if possible, why the action failed.
 * If omitted, will just return "Action failed.".
 * @returns A context message with the specified message.
 * @deprecated Action handlers can now be async, and RCE will handle  it properly.
 */
export function contextFailure(message?: string, tag: OutputTag = 'WARNING'): string {
    const result = message !== undefined ? `Action failed: ${message}` : 'Action failed.';
    logOutput(tag, result);
    return result;
}

//#endregion

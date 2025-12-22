/**
 * Helper functions and types for interacting with the Neuro Game SDK.
 */

import { Action } from 'neuro-game-sdk';
import { ACTIONS, Permission, PermissionLevel } from '../config/getters';
import { logOutput, turtleSafari } from '@/utils';
import { PromptGenerator } from '@/rce';
import { RCECancelEvent } from '@events/utils';
import { JSONSchema7 } from 'json-schema';

/** Data used by an action handler. */
export interface ActionData {
    id: string;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any;
}

/** The result of attempting to execute an action client-side. */
export interface ActionValidationResult {
    /**
     * If `false`, the action handler is not executed.
     * Warning: This is *not* the success parameter of the action result.
     */
    success: boolean;
    /**
     * The message to send Neuro.
     * If success is `true`, this is optional, otherwise it should be an error message.
     */
    message?: string;
    /** If `true`, Neuro should retry the action if it was forced. */
    retry?: boolean;
}

type TypedAction = Omit<Action, 'schema'> & { schema?: JSONSchema7 };

/** ActionHandler to use with constants for records of actions and their corresponding handlers */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RCEAction<T = any> extends TypedAction {
    /** A human-friendly name for the action. If not provided, the action's name converted to Title Case will be used. */
    displayName?: string;
    /** The JSON schema for validating the action parameters if experimental schemas are disabled. */
    schemaFallback?: JSONSchema7;
    /**
     * An object that defines an array of functions to validate the action's "environment".
     * Validators run before requests/executions to ensure environment/input validity.
     */
    validators?: {
        /** 
         * Synchronous validators that will block execution of the rest of the thread.
         * As this delays the action result to Neuro, any promises must resolve quickly so as to be effectively synchronous speed-wise. 
         */
        sync?: ((actionData: ActionData) => ActionValidationResult | Promise<ActionValidationResult>)[],
        /**
         * Asynchronous validators that will be ran in parallel to each other.
         * These will be executed after an action result, so it's perfect for long-running validators.
         * Async validators will time out (and consequently fail) after 1 second (1000ms).
         */
        async?: ((actionData: ActionData) => Promise<ActionValidationResult>)[];
    }
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     */
    cancelEvents?: ((actionData: ActionData) => RCECancelEvent<T> | null)[];
    /**
     * A function that is used to preview the action's effects.
     * This function will be called while awaiting user approval, if the action is set to Copilot permission.
     * 
     * The action must return a Disposable-like object. The disposable will not be awaited if async.
     * If your preview function does not require a dispose function to be called, return a no-op Disposable-like.
     * @example return { dispose: () => undefined } // for no-ops
     */
    // The type must be `any`, using `never` causes it to return type errors. 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preview?: (actionData: ActionData) => { dispose: () => any };
    /** The function to handle the action. */
    handler: RCEHandler;
    /** 
     * The function to generate a prompt for the action request (Copilot Mode). 
     * The prompt should fit the phrasing scheme "Neuro wants to [prompt]".
     * It is this way due to a potential new addition in Neuro API "v2". (not officially proposed)
     * More info (comment): https://github.com/VedalAI/neuro-game-sdk/discussions/58#discussioncomment-12938623
     */
    promptGenerator: PromptGenerator;
    /** Default permission for actions when no permission is configured in user or workspace settings. Defaults to {@link PermissionLevel.OFF}. */
    defaultPermission?: PermissionLevel;
    /**
     * The category of the request.
     * You can use null if the action is never added to the registry.
     */
    category: string | null;
    /** Whether to automatically register the action with Neuro upon addition. Defaults to true. */
    autoRegister?: boolean;
    /** A condition that must be true for the action to be registered. If not provided, the action is always registered. This function must never throw. */
    registerCondition?: () => boolean;
}

export type RCEHandler = (actionData: ActionData) => string | undefined | void;

/**
 * Strips an action to the form expected by the API.
 * @param action The action to strip to its basic form.
 * @returns The action stripped to its basic form, without the handler and permissions.
 */
export function stripToAction(action: RCEAction): Action {
    let schema: JSONSchema7 | undefined;
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

/**
 * Create a successful action result.
 * This should be used if all parameters have been parsed correctly.
 * @param message An optional message to send to Neuro.
 * @returns A successful action result.
 */
export function actionValidationAccept(message?: string): ActionValidationResult {
    return {
        success: true,
        retry: false,
        message: message,
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
 * @param retry It's highly recommended you use {@link actionValidationRetry} instead.
 * @returns A successful action result with the specified message.
 */
export function actionValidationFailure(message: string, retry = false): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message);
    return {
        success: false,
        retry: retry,
        message: message !== undefined ? `Action failed: ${message}` : 'Action failed.',
    };
}

/**
 * Create a context message that tells Neuro that the action failed and logs this.
 * Also logs the message to the console.
 * Note that this does not send the context message.
 * @param message The message to format.
 * @param {string} [tag="WARNING"] The tag to use for the log output.
 * This should explain, if possible, why the action failed.
 * If omitted, will just return "Action failed.".
 * @returns A context message with the specified message.
 */
export function contextFailure(message?: string, tag = 'WARNING'): string {
    const result = message !== undefined ? `Action failed: ${message}` : 'Action failed.';
    logOutput(tag, result);
    return result;
}

/**
 * Create an action result that tells Neuro to retry the forced action.
 * @param message The message to send to Neuro.
 * This should contain the information required to fix the mistake.
 * @returns A failed action result with the specified message.
 */
export function actionValidationRetry(message: string): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    return {
        success: false,
        retry: true,
        message: 'Action failed: ' + message,
    };
}

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

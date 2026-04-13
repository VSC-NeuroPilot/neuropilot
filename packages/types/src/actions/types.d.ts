import { JSONSchema7Object } from 'json-schema';
import { ActionForcePriorityEnum, Action, type NeuroClient } from 'neuro-game-sdk';
import type { PermissionLevel } from './enums';
import type { RCECancelEvent, RCEContext, ActionStatus } from './classes';
import type { CompanionAPI } from '../companions/register';

//#region Action forces

/**
 * The parameters for forcing actions.
 * @see {@link NeuroClient.forceActions} for most field documentation.
 */
export interface ActionForceParams {
    state?: string;
    query: string;
    ephemeral_context?: boolean;
    actionNames: string[];
    priority?: ActionForcePriorityEnum;
    /**
     * If specified, execute all actions with the specified permission level instead of the current one.
     * If an object is provided, the keys are action names and the values are the permission levels to use for those actions.
     * If an action is not included in the object, it will not have its permission overridden.
     * 
     * Note that at the moment, action forces will not be retried if the permission is {@link PermissionLevel.COPILOT}
     * or if the chosen action's handler is async.
     */
    overridePermissions?: PermissionLevel.COPILOT | PermissionLevel.AUTOPILOT | Record<string, PermissionLevel.AUTOPILOT | PermissionLevel.COPILOT>;
}

//#endregion


//#region Action definition types

/**
 * ActionHandler to use with constants for records of actions and their corresponding handlers.
 * 
 * You may optionally type the interface if you are sure the action will take a specific form.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RCEAction<T extends JSONSchema7Object | undefined = any, E = any> extends Action {
    /** 
     * A human-friendly name for the action. If not provided, the action's name converted to Title Case will be used. 
     * @example Edit File
     * @example edit_file -> Edit File // if displayName isn't set
     */
    displayName?: string;
    /** 
     * The JSON schema for validating the action parameters if experimental schemas are disabled.
     * Do not use this if you don't have an "experimental schema". Instead, simply specify {@link Action.schema the normal schema property}.
     * @todo likely deprecating experimental schemas
     */
    schemaFallback?: Action['schema'];
    /**
     * An object that defines an array of functions to validate the action's "environment".
     * Validators run before requests/executions to ensure environment/input validity.
     */
    validators?: {
        /** 
         * Synchronous validators that will block execution of the rest of the thread.
         * As this delays the action result to Neuro, any promises must resolve quickly so as to be effectively synchronous speed-wise. 
         * 
         * Tip: If you supply validators that ensure certain items are not nullable, you may be able to assert that they are a non-nullable value for {@link RCEAction.promptGenerator generating the Copilot-mode prompt}, {@link RCEAction.preview preview effects} and/or {@link RCEAction.handler handling the action}.
         */
        sync?: ((context: RCEContext<T, E>) => ActionValidationResult | Promise<ActionValidationResult>)[],
        /**
         * Asynchronous validators that will be ran in parallel to each other.
         * These will be executed after an action result, so it's perfect for long-running validators.
         * 
         * Async validators will time out (and consequently fail) after 1 second (1000ms). It is planned that this value will be adjustable in the future.
         */
        async?: ((context: RCEContext<T, E>) => Promise<ActionValidationResult>)[];
    }
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     * Returns from calling the `dispose()` function will not be used anywhere.
     */
    cancelEvents?: ((context: RCEContext<T, E>) => RCECancelEvent<E> | null)[];
    /**
     * A function that is used to preview the action's effects.
     * This function will be called while awaiting user approval, if the action is set to Copilot permission.
     * 
     * The action must return a Disposable-like object. The disposable will not be awaited if async.
     * If your preview function does not require a dispose function to be called, return a no-op Disposable-like.
     * @example return { dispose: () => undefined } // for no-ops
     */
    preview?: (context: RCEContext<T, E>) => { dispose: () => unknown };
    /** 
     * The function to handle the action.
     * This function must be synchronous.
     * 
     * An action result can be sent as either a synchronous result or asynchronous result, it will automatically be handled by RCE.
     * (see {@link RCEHandlerReturns})
     */
    handler: RCEHandler<T, E>;
    /** 
     * The function to generate a prompt for the action request (Copilot Mode). 
     * The prompt should fit the phrasing scheme "Neuro wants to [prompt]".
     * 
     * Only set this to `null` if the action is never intended to be used in Copilot mode.
     * 
     * It is this way due to a potential new addition in Neuro API "v2". (not officially proposed)
     * More info (comment): https://github.com/VedalAI/neuro-game-sdk/discussions/58#discussioncomment-12938623
     */
    promptGenerator: PromptGenerator<T, E> | null;
    /** Default permission for actions when no permission is configured in user or workspace settings. Defaults to {@link PermissionLevel.OFF}. */
    defaultPermission?: PermissionLevel;
    /**
     * The category of the request.
     * You can use null if the action is never added to the registry.
     */
    category: string | null;
    /**
     * Whether to automatically register the action with Neuro if all conditions are met.
     * Defaults to true.
     * 
     * If `false`, the RCE system will never automatically register the action, and only automatically unregister if the user disables permission.
     * You need to call {@link CompanionAPI.registerAction} or {@link CompanionAPI.unregisterAction} manually.
     * 
     * If `true`, the action will be automatically registered and unregistered based on the {@link RCEAction.registerCondition registerCondition} and current permission settings.
     * However, the conditions are not watched, so if the conditions change, the action may not be immediately registered or unregistered.
     * Call {@link CompanionAPI.reregisterAllActions} to update the registration.
     * 
     * Note that certain events also call {@link CompanionAPI.reregisterAllActions}.
     */
    autoRegister?: boolean;
    /**
     * Whether the action should be hidden in the action permissions view.
     * Usually meant for actions that are exclusively used in action forces.
     */
    hidden?: boolean;
    /**
     * A condition that must be true for the action to be registered.
     * If not provided, the action is always registered.
     * Should not be used if {@link RCEAction.autoRegister autoRegister} is `false`.
     * **This function must never throw.**
     */
    registerCondition?: () => boolean;
    /** 
     * Setup handlers that will be invoked to help setup the {@link RCEContext.storage} object.
     * These functions should not throw.
     * 
     * These functions will be parallelised, so the same key should not be accessed from multiple functions.
     */
    contextSetupHook?: ((context: RCEContext<T, E>) => Thenable<void>)[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptGenerator<T extends JSONSchema7Object | undefined, E = any> = string | ((context: RCEContext<T, E>) => string);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RCEHandler<T extends JSONSchema7Object | undefined, E = any> = (context: RCEContext<T, E>) => RCEHandlerReturns;
/**
 * The possible values that an RCE handler can return.
 */
export type RCEHandlerReturns = ActionHandlerResult | Thenable<ActionHandlerResult>;

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
    /** The reason to show on action panel. */
    historyNote?: string;
}

export interface ActionHandlerResult {
    success: ActionHandlerSuccess;
    message?: string;
    historyNote?: string;
}

type ActionHandlerSuccess = 'success' | 'failure' | 'retry';

//#endregion

export type InjectionBaseData = Omit<RCEAction, 'name'>;

//#region action event types

export interface ActionsEventData {
    readonly action: string;
    readonly status: ActionStatus;
    readonly message?: string;
    readonly executionId: string;
}

//#endregion

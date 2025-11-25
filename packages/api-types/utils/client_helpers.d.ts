import { JSONSchema7 } from 'json-schema';
import { Action } from 'neuro-game-sdk';
import { PermissionLevel } from '../settings/permissions';
// TODO: Figure this out
import { RCECancelEvent } from './actions';

/**
 * A prompt parameter can either be a string or a function that converts ActionData into a prompt string.
 */
export type PromptGenerator = string | ((actionData: ActionData) => string);

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

type RCEHandler = (actionData: ActionData) => string | undefined | void;

/** ActionHandler to use with constants for records of actions and their corresponding handlers */
export interface RCEAction<T = unknown> extends TypedAction {
    /** A human-friendly name for the action. If not provided, the action's name converted to Title Case will be used. */
    displayName?: string;
    /** The JSON schema for validating the action parameters if experimental schemas are disabled. */
    schemaFallback?: JSONSchema7;
    /** The function to validate the action data *after* checking the schema. */
    validators?: ((actionData: ActionData) => ActionValidationResult | Promise<ActionValidationResult>)[];
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     */
    cancelEvents?: ((actionData: ActionData) => RCECancelEvent<T> | null)[];
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

import { JSONSchema7 } from 'json-schema';
import { Action } from 'neuro-game-sdk';
import { Permission, PermissionLevel } from '../settings/permissions';
import { RCECancelEvent } from '@events/utils';

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

/** ActionHandler to use with constants for records of actions and their corresponding handlers */
export interface RCEAction extends TypedAction {
    /** The permissions required to execute this action. */
    permissions: Permission[];
    /** The function to validate the action data *after* checking the schema. */
    validators?: (((actionData: ActionData) => ActionValidationResult) | ((actionData: ActionData) => Promise<ActionValidationResult>))[];
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     */
    cancelEvents?: ((actionData: ActionData) => RCECancelEvent | null)[];
    /** The function to handle the action. */
    handler: (actionData: ActionData) => string | undefined;
    /** 
     * The function to generate a prompt for the action request (Copilot Mode). 
     * The prompt should fit the phrasing scheme "Neuro wants to [prompt]".
     * It is this way due to a potential new addition in Neuro API "v2". (not officially proposed)
     * More info (comment): https://github.com/VedalAI/neuro-game-sdk/discussions/58#discussioncomment-12938623
     */
    promptGenerator: PromptGenerator;
    /** Default permission for actions like chat, cancel_request, etc */
    defaultPermission?: PermissionLevel;
}

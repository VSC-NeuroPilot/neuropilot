import { ActionForcePriorityEnum, Action, type NeuroClient } from 'neuro-game-sdk';
import type { JSONSchema7 } from 'json-schema';
import { Range } from 'vscode';
import type { StandardJSONSchemaV1 } from '@standard-schema/spec';

import type { PermissionLevel, DiffRangeType } from './enums';
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

export type SchemaTypes = StandardJSONSchemaV1 | JSONSchema7 | undefined;

/**
 * Extracts the input type from a Standard Schema and casts it to be compatible with RCEAction.
 * This is necessary because Standard Schema's InferInput returns a type that may not structurally match JSONSchema7Object.
 */
export type InferDataFromSchema<TSchema extends SchemaTypes> =
    TSchema extends StandardJSONSchemaV1 ? StandardJSONSchemaV1.InferInput<TSchema> : TSchema extends JSONSchema7 ? unknown : undefined;

/**
 * ActionHandler to use with constants for records of actions and their corresponding handlers.
 * 
 * You may optionally type the interface if you are sure the action will take a specific form.
 */
export interface RCEAction<
    TData extends unknown | undefined = undefined,
    TSchema extends SchemaTypes = SchemaTypes,
    TDataShape extends unknown | undefined = TData extends undefined ? InferDataFromSchema<TSchema> : TData,
> extends Omit<Action, 'schema'> {
    /**
     * A valid JSON Schema or Standard JSON Schema that describes the action's parameters.
     * Standard JSON Schemas (like Zod v4+) will be automatically converted to JSON Schema before registration.
     */
    schema?: TSchema;
    /** 
     * A human-friendly name for the action. If not provided, the action's name converted to Title Case will be used. 
     * @example Edit File
     * @example edit_file -> Edit File // if displayName isn't set
     */
    displayName?: string;
    /**
     * An object that defines an array of functions to validate the action's "environment".
     * Validators run before requests/executions to ensure environment/input validity.
     */
    validators?: RCEValidators<TData, TSchema, TDataShape>
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     * Returns from calling the `dispose()` function will not be used anywhere.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cancelEvents?: ((context: RCEContext<TData, TSchema, TDataShape>) => RCECancelEvent<any> | null)[];
    /**
     * A function that is used to preview the action's effects.
     * This function will be called while awaiting user approval, if the action is set to Copilot permission.
     * 
     * The action must return a Disposable-like object. The disposable will not be awaited if async.
     * If your preview function does not require a dispose function to be called, return a no-op Disposable-like.
     * @example return { dispose: () => undefined } // for no-ops
     */
    preview?: (context: RCEContext<TData, TSchema, TDataShape>) => { dispose: () => unknown };
    /** 
     * The function to handle the action.
     * This function must be synchronous.
     * 
     * An action result can be sent as either a synchronous result or asynchronous result, it will automatically be handled by RCE.
     * (see {@link RCEHandlerReturns})
     */
    handler: RCEHandler<TData, TSchema, TDataShape>;
    /** 
     * The function to generate a prompt for the action request (Copilot Mode). 
     * The prompt should fit the phrasing scheme "Neuro wants to [prompt]".
     * 
     * Only set this to `null` if the action is never intended to be used in Copilot mode.
     * 
     * It is this way due to a potential new addition in Neuro API "v2". (not officially proposed)
     * More info (comment): https://github.com/VedalAI/neuro-game-sdk/discussions/58#discussioncomment-12938623
     */
    promptGenerator: PromptGenerator<TData, TSchema, TDataShape> | null;
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
    contextSetupHook?: ((context: RCEContext<TData, TSchema, TDataShape>) => Thenable<void>)[];
}

/**
 * A prompt parameter can either be a string or a function that converts an RCEContext into a prompt string.
 */
export type PromptGenerator<
    TData extends unknown | undefined = unknown,
    TSchema extends StandardJSONSchemaV1 | JSONSchema7 | undefined = JSONSchema7 | undefined,
    TDataShape = InferDataFromSchema<TSchema>,
> = string | ((context: RCEContext<TData, TSchema, TDataShape>) => string);


// apparently this JSDoc is really hard when trying to link to RCEAction.validators.async
interface RCEValidators<
    TData extends unknown | undefined,
    TSchema extends SchemaTypes,
    TDataShape = InferDataFromSchema<TSchema>,
> {
    /** 
     * Synchronous validators that will block execution of the rest of the thread.
     * As this delays the action result to Neuro, any thenables must resolve quickly so as to be effectively synchronous speed-wise.
     * 
     * Tip: If you supply validators that ensure certain items are not nullable, you may be able to assert that they are a non-nullable value for:
     * 
     * - {@link RCEValidators.async asynchronous validators},
     * - {@link RCEAction.promptGenerator generating the Copilot-mode prompt},
     * - {@link RCEAction.preview preview effects}, and/or
     * - {@link RCEAction.handler handling the action}.
     * 
     * @todo Turn into factory function that returns arrays?
     */
    sync?: ((context: RCEContext<TData, TSchema, TDataShape>) => ActionValidationResult)[],
    /**
     * Asynchronous validators that will be ran in parallel to each other.
     * These will be executed after an action result, so it's perfect for long-running validators.
     * 
     * Async validators will time out (and consequently fail) after 1 second (1000ms). It is planned that this value will be adjustable in the future.
     * @todo Turn into factory function that returns arrays?
     */
    async?: ((context: RCEContext<TData, TSchema, TDataShape>) => Thenable<ActionValidationResult>)[];
}

type RCEHandler<
    TData extends unknown | undefined,
    TSchema extends SchemaTypes,
    TDataShape = InferDataFromSchema<TSchema>,
> = (context: RCEContext<TData, TSchema, TDataShape>) => RCEHandlerReturns;
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
    /**
     * The name of the action whose status was just updated.
     */
    readonly action: string;
    /**
     * The action's current status.
     */
    readonly status: ActionStatus;
    /**
     * The message attached to the status update.
     */
    readonly message?: string;
    /**
     * A unique ID that is generated for every execution.
     * Can be used to separate multiple executions of the same action.
     */
    readonly executionId: string;
}

//#endregion

//#region Patience diff

export interface DiffLine {
    /** The text of the line. */
    text: string;
    /** The original line number in the old version of the text, or -1 if the line is new. */
    oldIndex: number;
    /** The line number in the new version of the text, or -1 if the line was deleted. */
    newIndex: number;
}
export interface DiffPlusLine extends DiffLine {
    /** Whether the line was moved. */
    moved: boolean;
    /**
     * The original line number in the old version of the text, or -1 if the line is new.
     * For moved lines, this is the line number this line was moved from.
     */
    oldIndex: number;
    /**
     * The line number in the new version of the text, or -1 if the line was deleted.
     * For moved lines, this is the line number this line was moved to.
     * If this is -1 for a moved line, it is the counterpart of another moved line where the correct index is set.
     */
    newIndex: number;
}

export interface Diff {
    /** The lines in the diff. */
    lines: DiffLine[];
    /** The number of lines in the old text that do not appear in the new text (i.e., deleted or changed lines). */
    lineCountDeleted: number;
    /** The number of lines in the new text that do not appear in the old text (i.e., inserted or changed lines). */
    lineCountInserted: number;
}

export interface DiffPlus extends Diff {
    lines: DiffPlusLine[];
    /** The number of lines that were moved. */
    lineCountMoved: number;
}

export interface DiffRange {
    /** The line/column range of the part of the diff. */
    range: Range;
    /** The type of the diff range (added, removed or modified). */
    type: DiffRangeType;
    /** The text that was removed. Only applicable for removed and modified ranges. */
    removedText?: string;
}

//#endregion

//#region Context

// Original name: NeuroPositionContext
export interface PositionContext {
    /** The context before the cursor, or the entire context if the cursor is not defined. */
    contextBefore: string;
    /** The context after the range, or an empty string if the cursor is not defined. */
    contextAfter: string;
    /** The zero-based line where {@link PositionContext.contextBefore contextBefore} starts. */
    startLine: number;
    /** The zero-based line where {@link PositionContext.contextAfter contextBefore} ends. */
    endLine: number;
    /** The number of total lines in the file. */
    totalLines: number;
    /** `true` if the cursor is defined and inside the context, `false` otherwise. */
    cursorDefined: boolean;
}

// Original name: NeuroPositionContextOptions
export interface PositionContextOptions {
    /** The position of the cursor in the document. */
    cursorPosition?: vscode.Position;
    /** The start of the range around which to get the context. Defaults to the start of the document if not provided. */
    position?: vscode.Position;
    /** The end of the range around which to get the context. If not provided, defaults to {@link PositionContextOptions.position position}, or the end of the document if {@link PositionContextOptions.position position} is not provided. */
    position2?: vscode.Position;
}

export type CursorPositionContextStyle = 'off' | 'inline' | 'lineAndColumn' | 'both';

//#endregion

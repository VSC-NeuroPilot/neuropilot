/**
* This is a draft implementation of the NeuroPilot API.
* This might not represent the final form of the API.
*/

// Instances of Position should be imaginatively replaced with an actual object interface to describe the Neuro cursor position.
import { Event, Position, WorkspaceConfiguration } from 'vscode';
import { Action, NeuroClient } from 'neuro-game-sdk';
import { ActionData, ActionValidationResult } from '@/neuro_client_helper';
import { Permission, PermissionLevel } from '@/config';
import { PromptGenerator } from '@/rce';
export type { Permission } from '@/config';

// "next" allows people to access API changes early, if any, but can and will change at any time
export type CurrentAPIVersions = 'next' | 1;
export type DeprecatedAPIVersions = 0;

export interface NeuroPilotExtension {
    // This will most likely be useless...
    readonly enabled: boolean;
    readonly onDidChangeEnablement: Event<boolean>;

    // API versions reader
    readonly supportedAPIVersions: CurrentAPIVersions;
    readonly deprecatedAPIVersions: DeprecatedAPIVersions;

    // Neuro API connection status + event listener
    readonly connected: boolean;
    readonly onConnectEvent: Event<boolean>;

    /**
    * Gets the NeuroPilot API.
    * 
    * @param version API version number. Valid values can be found with {@link APIVersions}.
    * @returns The {@link NeuroPilotAPI NeuroPilot API}.
    * @todo Will {@link NeuroPilotAPI} change depending on the environment (local vs remote)? If so, we will need 2 or 3 type interfaces for them.
    * @warns If the API version has been deprecated. This will be logged in NeuroPilot's own log output.
    * @throws If the API version has been removed, or if NeuroPilot is disabled. Read {@link enabled} or listen to {@link onDidChangeEnablement} to check if it's been enabled.
    * @todo Is throwing on disable even necessary?
    */
    getAPI(version: CurrentAPIVersions | DeprecatedAPIVersions): NeuroPilotAPI;
}

// @ts-expect-error no cursor props quite yet
type CursorReturns = CursorPropsHere | null | undefined;

export interface Validators {
    /** 
    * The function(s) to validate the action data *after* checking the schema, but **before** an action result packet is sent. 
    * This can either be a synchronous function or an asynchronous function. Either way, both must return an ActionValidationResult after awaiting.
    * 
    * Be aware that we await this function specifically for non-long-running asynchronous validators (e.g. VSCode filesystem APIs)
    * that wouldn't delay the return of an action result to Neuro by a long time (which would go against Neuro API best practices).
    * For long running asynchronous validators (e.g. pinging an external endpoint), please use {@link async} instead.
    */
    sync?: (((actionData: ActionData) => ActionValidationResult) | ((actionData: ActionData) => Promise<ActionValidationResult>))[];
    /**
    * Function(s) to validate the action data after an action result packet is sent.
    * These should be used for long running asynchronous validators (e.g. pinging an external endpoint).
    * 
    * These will be checked separately to {@link sync}.
    * All async validators will run concurrently.
    * If one fails, the action will be rejected regardless of the results of other asynchronous validators.
    * During this process, Neuro cannot execute another action, whether the permission level is Copilot or Autopilot.
    */
    async?: ((actionData: ActionData) => Promise<ActionValidationResult>)[];
}

/** ActionHandler to use with constants for records of actions and their corresponding handlers */
export interface RCEAction extends Action {
    /** The permissions required to execute this action. */
    permissions: Permission[];
    /**
    * Function(s) to validate the action data **after** schema + permission checking.
    */
    validators?: Validators;
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

export interface emergencyShutdown {
    /** Permission contributions. Requires that 'Off' is at least a valid option for each *.permission */
    registerPermission: WorkspaceConfiguration;
    /** Secondary event that fires when the shutdown command is ran. Useful for other things requiring shutdown (pulling an example from neuropilot itself, tasks and terminals would use this) */
    shutdownEvent: Event<void>;
    /** Use this if a shutdown went wrong. Pops up an alternate display message. */
    reportShutdownFailure: string;
}

interface ChatPlugins extends RCEAction { // Chat plugins MUST be UI-side to hook into Neuro immediately (unless it's stable enough to also somehow allow chat plugins at workspace)
    chat: boolean; // Add this action as an action option to the force.
    chatOnly: boolean; // If true, this action will only be registered while requesting a response via chat view.
}

interface RCEActionWithExtensionInfo extends RCEAction {
    origin: string;
    environment: RunEnvsArray;
}

interface DocsPageDetails {
    name: string;
    path: string;
}

interface DocsCategories {
    path: string;
    pages?: DocsPageDetails[];
    categories?: DocsCategories[];
}

interface DocsRegister {
    base: string; // Example: https://vsc-neuropilot.github.io/neuropilot
    useCategories?: boolean; // Whether or not to use the categories integration (which doesn't require users to enter the URL path manually, at the cost of having to be pre-defined by the extension) - defaults to false
    pages?: DocsPageDetails[];
    categories?: DocsCategories[];
}

export type UniqueArray<T> = T extends [infer First, ...infer Rest]
    ? First extends Rest[number]
        ? never // If the first item exists in the rest of the array, it's not unique
        : [First, ...UniqueArray<Rest>]
    : T;

export type RunEnvsArray = UniqueArray<EnvEnums[]>;

export type SupportTypes = boolean | 'limited';

export interface ExtensionHUD { // I (KTrain) think there should be a way to view what extensions are connected, perhaps using a sidebar view? Also has the potential to display statistics such as amount of registered actions
    virtualWorkspaces: {
        supported: SupportTypes;
        message?: string;
    }
    untrustedWorkspaces: {
        supported: SupportTypes;
        message?: string;
        disabledSettings?: string[];
    }
}

export enum EnvEnums {
    UI = 'UI (Client)',
    Workspace = 'Workspace (Server)',
    Web = 'Web (Browser)',
}

interface ExtensionInfo {
    author?: string;
    description?: string;
    docs?: DocsRegister;
    runsIn?: RunEnvsArray;

    // Essentially permission declarations sorta
    registersActions?: boolean;
    sendsPassiveContexts?: boolean;
    canForceActions?: boolean;
    accessNeuroCursor?: boolean;
    usesFilePaths?: boolean;
}

interface ExtensionRegisterReturns {
    id: string;
    /** Returned in case it differs due to duplicate IDs */
    actionPrefix: string;
    /** Verification/ID token you'll need to use. */
    token: string;
}

interface RegistrationName {
    /** Display name */
    display: string;
    /** Extension "ID" for NeuroPilot. This does not necessarily have to match your extension's Marketplace ID. */
    id: string;
    /** The normalized name that will be prefixed onto action names to differentiate to Neuro. */
    nameOnActions: string;
}

interface ModifyMetadata {
    displayName?: string;
    nameOnActions?: string; /** WARNING: YOU MUST UNREGISTER ALL ACTIONS FIRST FROM BOTH NEURO AND NEUROPILOT! If not, you WILL no longer be able to control them! @todo Make this unregistration/reregistration automatic? */
    docsURL?: string; // changing this will not boot out the user if they are already viewing docs; also only affects the `base` key in DocsRegister
}

/**
* NeuroPilot API types
* This is essentially a wrapper/reimplementation of the [TypeScript Neuro Game SDK by AriesAlex](https://github.com/AriesAlex/typescript-neuro-game-sdk/).
* However, it comes with extra features designed for Neuro to interact with Visual Studio Code safely.
* 
* @param token All update functions require this value to verify authenticity. 
* @throws All updating commands throw an error when receiving an unminted token (right?).
*/
export interface NeuroPilotAPI {
    /**
    * Gets the current instance of the {@link NeuroClient}.
    * @returns The current NeuroClient instance or `null` if not connected.
    * @todo We really should not expose the NeuroClient directly.
    */
    getClient(): NeuroClient | null;

    /**
    * Registers your extension with NeuroPilot.
    * This will allow you to start registering and receiving actions.
    * Additionally, Neuro will be notified that your extension has been activated and registered.
    * 
    * If you would like, you can also send a deactivation notice using {@link deactivatedExtension}, which will unregister your actions (from NeuroPilot) automatically and tell Neuro that your extension has been deactivated.
    * @param name Your extension's display name and action prefix identifier, to allow unique IDs.
    * @param info More information about your extension, if you wish.
    * @returns Among other things, a token that you'll need to use with every (updating) function call done by your extension to NeuroPilot, for verification purposes. See {@link ExtensionRegisterReturns}.
    */
    registerExtension(name: RegistrationName, info?: ExtensionInfo): ExtensionRegisterReturns;

    /**
    * Modifies registered metadata. Only allows modifying certain metadata.
    * 
    * @param data See {@link ModifyMetadata}.
    */
    modifyExtensionMeta(token: string, data: ModifyMetadata): ModifyMetadata;

    /**
    * Sends a deactivation notice to NeuroPilot.
    * This unregisters all actions from the handler list, meaning Neuro will no longer be able to execute them without running into an error.
    * Neuro will also receive notice that your extension has been deactivated.
    * Note: This does **not** unregister the extension's actions from Neuro. The Reload Permissions command must be used for that.
    * @param message An optional, custom message to send upon deactivation.
    */
    deactivatedExtension(token: string, message?: string): void;

    /** @todo Split between deactivation message and deactivation signal? */

    /**
    * Registers a callback to be called to register actions.
    * This callback should return all actions that Neuro should be able to use.
    * Actions are registered when connecting to the Neuro API or on reloading permissions.
    * The callback will also be called after it is registered (if connected to the API).
    * Note: This only registers tells NeuroPilot which actions to register *right now*,
    * use {@link addAction} to let NeuroPilot handle the actions.
    * @param callback The callback to call when actions are registered.
    */
    onActionRegistration(token: string, callback: () => RCEAction[]): void;

    /**
    * Registers a callback to be called to unregister actions.
    * This callback should return a list of strings corresponding to your recorded action names that Neuro is no longer allowed to use.
    * The callback will also be called upon reconnecting to the Neuro API.
    * Note: This only registers tells NeuroPilot which actions to unregister *right now*,
    * use {@link removeAction} to tell NeuroPilot to no longer handle the actions.
    * @param callback The callback to call when actions are unregistered.
    */
    onActionUnregistration(token: string, callback: () => string[]): void;

    /** @todo do we really need to split them after all? */

    /**
    * Adds an action to the extension.
    * This is required for action to be handled when Neuro executes it.
    * Note: This does not *register* the action, use {@link onActionRegistration} for that.
    * @param name The unique ID of the action. Should follow the [Neuro API specification for action names](https://github.com/VedalAI/neuro-game-sdk/blob/main/API/SPECIFICATION.md#parameters-1).
    * @param action The action to add.
    */
    addAction(token: string, name: string, action: RCEAction): void;

    /**
    * Removes actions from the extension's list.
    * This can be useful if you don't want to handle an action at all anymore.
    * Note: This does not *unregister* the action, use {@link onActionUnregistration} beforehand.
    * @param name The action name to unregister
    * @throws When you attempt to remove an action from another extension.
    */
    removeAction(token: string, ...names: string[]): void;

    /**
    * Returns the environment NeuroPilot is currently running in.
    * This can be useful if you need to know which environment you are hooking into NeuroPilot right now to respond to appropriately.
    * @returns The name of the environment.
    */
    getEnvironment(): string;

    /**
    * Checks if the provided **absolute** path(s) is/are Neuro-safe.
    * @param paths Multiple string args to check for absolute paths.
    * @returns A {@link boolean} that says if _all_ input files are Neuro-safe.
    */
    isPathNeuroSafe(...paths: string[]): boolean;

    /**
    * Sends passive context to Neuro.
    * The context can be plain text or Markdown.
    * Note: Do NOT use this function to send asynchronous action results, use {@link sendResult} instead.
    * @param context The string to send as context.
    * @param silent A boolean that specifies whether to prompt Neuro to respond vocally.
    */
    sendPassiveContext(token: string, context: string, silent?: boolean): void;

    /**
    * Sends an action's result as a context packet.
    * This is not needed if you synchronously return results (i.e. your handler function returns a value other than `null`, `void`, `undefined` or anything like that)
    * @param message The result message.
    * @param successs Whether or not the action was successful.
    */
    sendResult(token: string, message?: string, success?: boolean): void;

    /**
    * Force an action from Neuro.
    * This has the same syntax as [the TypeScript Neuro Game SDK's implementation](https://github.com/AriesAlex/typescript-neuro-game-sdk/blob/main/src/index.ts).
    * @param query The plaintext query string to send to Neuro. This should ideally prompt Neuro with the action she needs to do.
    * @param action_names An array of action names that Neuro can choose to use. This will(?) throw if one of the action names does not appear in the current list of actions handled by your extension.
    * @param state An arbitrary (plaintext, Markdown, JSON, etc...) string that describes the current state. An example of doing this would be sending the file's contents (as seen in NeuroPilot's chat and completions code).
    * @param ephemeral_context Whether or not the state should persist as context after the action force, `false` will add the state to Neuro's context.
    */
    forceNeuroAction(token: string, query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void;

    /**
    * Gets the current location of Neuro's cursor.
    * @returns Details about Neuro's cursor position, `null` if the editor is focused to a file she can't access, or `undefined` if the cursor doesn't exist.
    */
    getVirtualCursor(): CursorReturns;

    /**
    * Sets the current location of Neuro's cursor, using the line:column syntax.
    * @param location The location on where to place Neuro's cursor, or `null` to remove it.
    * @returns Details about Neuro's new cursor position, or `null` if the editor is focused to a file she can't access.
    */
    setVirtualCursor(token: string, location: Position | null): CursorReturns;

    /**
    * Gets the person currently set as the Neuro API server.
    * @returns The name of the current Neuro API name set in NeuroPilot settings.
    */
    checkNeuroAPIName(): string;

    /**
    * Checks if the name passed as input is currently set as the Neuro API user.
    * @returns `true` if the name matches with the current Neuro API user, `false` otherwise.
    */
    checkNeuroAPIName(name: string): boolean;
}

/** All of the ActionValidation functions return an {@link ActionValidationResult}. */
export interface ActionValidation {
    /**
    * Returns a successful action result to Neuro.
    * @param message An optional message about the action result.
    */
    actionValidationAccept(message?: string): ActionValidationResult;

    /**
    * Returns a "failed" action result to Neuro.
    * 
    * WARNING: This does not make Neuro automatically retry the action if it was part of a forced action! Use the {@link actionValidationRetry} function instead.
    * @param message The fail message to give, fitting the scheme of `Action failed: {message}`. If omitted, it will just be `Action failed.` 
    */
    actionValidationFailure(message?: string): ActionValidationResult;

    /**
    * Tells Neuro she doesn't have the ability to access one or more paths in her input.
    */
    actionValidationNeuroUnsafePath(): ActionValidationResult;

    /**
    * Returns an action result that tells Neuro to retry (if it was part of an actions force).
    * @param message The message telling her how to retry (example: "Item 1 is missing.")
    */
    actionValidationRetry(message: string): ActionValidationResult;
}

interface ExtensionRegisterObject {
    info: ExtensionInfo;
    actionPrefix: string;
    token: string;
    onDeactivation: () => void;
}

type TokenList = Record<string, ExtensionRegisterObject>;

/** 
* @todo Implementation
* 
* How do we store extensions + tokens?
* 
* Option 1: Store each name, action prefix, token and deactivation function in an object, then place it into an array.
* Should be able to use EXTENSIONS.find(companion => companion.token === token) to identify it, might be a tiny bit slow but idk
* 
* Option 2: Store inside a dictionary with the extension prefix as the key and everything else inside an object of it.
* Would require us to do login-style ID and token input when using tokens but should be easier to find?
*/

/**
* @todo Should we also make a separate helper class for NeuroPilot?
* 
* Would be beneficial to encourage/ease the use of the API.
* However, as we can't provide this directly through the extension,
* this would mean a separate package needs to be constructed and kept up-to-date with the API.
* 
* Rough types design of the NeuroPilotHelper class below.
*/
export class NeuroPilotHelper {
    private token: string;
    private extensionInfo: HelperClassEXTInfo;
    private API: object;

    /** 
    * Constructor class for the helper.
    * 
    * @param info An object containing extension info.
    * @param token A token to interact with NeuroPilot. If supplied, the class assumes that you have registered separately and will simply store that token, without attempting to reconnect to the API.
    * @throws If any info params are invalid.
    */
    constructor(info: HelperClassEXTInfo, token?: string);

    /** 
    * Registers actions to both Neuro and NeuroPilot.
    * If you register an action that is already registered to Neuro or NeuroPilot, the behaviour will depend:
    * - If Neuro already has the action registered but not NeuroPilot, Neuro will not receive an action unregistration, potentially causing her packet to go out-of-sync.
    * - If NeuroPilot does have info on the action already, NeuroPilot will throw an error. Use {@link updateAction} instead.
    * 
    * @param actions An array of RCE-decorated actions. Automatically strips unnecessary data before sending to Neuro.
    * @throws If your schema contains invalid keys.
    */
    registerAction(actions: RCEAction[]): void;

    /**
    * Unregisters actions to both Neuro and NeuroPilot.
    * If you unregister an already unregistered action from either Neuro or NeuroPilot, nothing will happen to the side that already unregistered the action.
    * 
    * @param actions An array of strings corresponding to names of actions to unregister.
    * @param onlyNeuro If `true`, only unregisters the action on the Neuro side.
    */
    unregisterAction(actions: string[], onlyNeuro: boolean): void;

    /**
    * Updates a registered action.
    * If NeuroPilot-specific keys are updated, Neuro will not receive an action unregistration.
    * Note: You cannot modify an action name using this, you have to fully unregister and re-register.
    * 
    * @param name The name of the action.
    * @param modifications An object containing the data you want to modify.
    * @throws If NeuroPilot doesn't already have that action.
    */
    modifyAction(name: string, modifications: ModifyActionObject): void;

    /**
    * Gets the position of Neuro's editing cursor.
    * This will only be a non-nullish value if Neuro can edit the active file.
    * 
    * @returns An object describing Neuro's cursor, `null` if she doesn't have permission, or `undefined` if for some reason the cursor doesn't exist.
    */
    getCursor(): CursorReturns;

    /**
    * Gets the position of Neuro's editing cursor in a specific file.
    * This will be a non-nullish value if the file is open *and* Neuro is allowed to edit it.
    * 
    * @param file The file to look for.
    * @returns Same as {@link getCursor}.
    */
    getCursor(file: string): CursorReturns;

    /**
    * Gets the position of Neuro's editing cursor in multiple files.
    * This will automatically filter out invalid paths, and if folders are specified, also automatically drops Neuro-unsafe paths.
    * @todo Accept glob-specified/regex-specified paths?
    * 
    * If you want to see the cursor state across the entire workspace, use {@link getWorkspaceCursors}.
    * 
    * @param paths Any amount of paths to a specific file or folder.
    * @returns An array of {@link MultiCursorType objects} that specify where the cursor is in each requested file/folder.
    */
    getCursors(...paths: string[]): MultiCursorType[];

    /**
    * Gets the positioning of Neuro's editing cursor in all files she can access in the current workspace.
    * This will automatically filter out Neuro-unsafe paths.
    * @todo Accept glob-specified/regex-specified paths?
    * 
    * @returns An array of {@link MultiCursorType objects} that specify where the cursor is in each file/folder.
    */
    getWorkspaceCursors(): MultiCursorType[];

    /**
    * Sets the position of Neuro's editing cursor **in the current file**.
    * 
    * @param position An object describing where to set Neuro's cursor.
    * @returns Same props as {@link getCursor}.
    */
    setCursor(position: Position): CursorReturns;

    /** All other interaction actions go here obv */

    /* Utilities that you may want to use. */

    /**
    * Neuro-safe path validator.
    * This respects the Include/Exclude Pattern settings as well as Allow Unsafe Paths settings provided by NeuroPilot.
    * @param paths Any amount of paths, as strings, to validate the safety of all of them.
    * @returns `true` if **all** paths are safe, `false` otherwise.
    */
    checkNeuroSafePathValidator(...paths: string[]): boolean;

    /**
    * Gets the name currently set as the Neuro API.
    * Be aware that this can return a value beyond the enums provided by NeuroPilot.
    * 
    * @returns The currently set name of the Neuro API.
    */
    getNeuroAPIName(): string;

    /**
    * Checks if the Neuro API name matches as expected.
    * 
    * @param name The name to check against.
    * @returns `true` if matching, `false` otherwise.
    */
    getNeuroAPIName(name: string): boolean;
}

export interface MultiCursorType {
    file: string;
    cursor: CursorReturns
}

export interface HelperClassEXTInfo {
    name: string;
    id: string;
}

export interface ModifyActionObject {
    description?: string;
    schema?: Record<string, never>;
    /* Properties below this line are NeuroPilot-specific and won't trigger an action unregistration. */
    permissions?: Permission[];
    validators?: Validators;
    handler?: (actionData: ActionData) => string | undefined;
    promptGenerator?: PromptGenerator;
    defaultPermission?: PermissionLevel;
}

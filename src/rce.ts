/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 */

import * as vscode from 'vscode';
import { ActionData } from 'neuro-game-sdk';
import { ActionForceParams, actionHandlerFailure, ActionHandlerResult, actionHandlerSuccess, RCEAction, stripToAction } from '@/utils/neuro_client';
import { NEURO } from '@/constants';
import { isThenable, logOutput, notifyOnCaughtException } from '@/utils/misc';
import { ACTIONS, CONFIG, CONNECTION, getAllPermissions, getPermissionLevel, PermissionLevel, stringToPermissionLevel } from '@/config';
import { validate } from 'jsonschema';
import type { RCECancelEvent } from '@events/utils';
import { fireOnActionStart, updateActionStatus } from '@events/actions';
import { RCEContext } from '@/context/rce';

import type { NeuroClient } from 'neuro-game-sdk';
import type { JSONSchema7Object } from 'json-schema';

export const CATEGORY_MISC = 'Miscellaneous';

const ACTIONS_ARRAY: RCEAction[] = [];
const REGISTERED_ACTIONS: Set<string> = /* @__PURE__ */ new Set<string>();

/**
 * A prompt parameter can either be a string or a function that converts an RCEContext into a prompt string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptGenerator<T extends JSONSchema7Object | undefined, E = any> = string | ((context: RCEContext<T, E>) => string);

let activeRequestContext: RCEContext | null = null;

function getActiveRequestContext(): RCEContext | null {
    return activeRequestContext;
}

function setActiveRequestContext(context: RCEContext | null): void {
    activeRequestContext = context;
}

export interface ExtendedActionInfo {
    action: RCEAction;
    isRegistered: boolean;
    effectivePermissionLevel: PermissionLevel;
    isConfigured: boolean;
    configuredWorkspacePermission?: PermissionLevel;
    configuredGlobalPermission?: PermissionLevel;
}

export const cancelRequestAction: RCEAction = {
    name: 'cancel_request',
    description: 'Cancel the current request.',
    category: null,
    handler: handleCancelRequest,
    promptGenerator: () => '', // No prompt needed for this action
    defaultPermission: PermissionLevel.AUTOPILOT,
    hidden: true,
};

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(): ActionHandlerResult {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        return actionHandlerFailure('No active request to cancel.', 'No active request.');
    }
    const data = activeContext.data;
    clearRceRequest(activeContext);
    activeContext.done(false);
    updateActionStatus(data, 'cancelled', 'Cancelled on Neuro\'s request');
    return actionHandlerSuccess('Request cancelled.', `Cancelled action "${data.name}"`);
}

/**
 * RCE's emergency shutdown component
 * Automatically clears the RCE dialog and tell Neuro her requests was cancelled.
 * Only runs if there is an RCE callback in NEURO.
 */
export function emergencyDenyRequests(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        return;
    }
    const data = activeContext.data;
    updateActionStatus(data, 'cancelled', 'Emergency shutdown activated');
    clearRceRequest(activeContext);
    activeContext.done(false);
    logOutput('INFO', `Cancelled ${activeContext.action.name} due to emergency shutdown.`);
    NEURO.client?.sendContext('Your last request was denied.');
    vscode.window.showInformationMessage(`The last request from ${NEURO.currentController} has been denied automatically.`);
}

export function clearRceRequest(context: RCEContext | null = getActiveRequestContext()): void {
    if (!context?.request) return;
    context.request.resolve();
    context.request = undefined;
    if (getActiveRequestContext() === context) {
        setActiveRequestContext(null);
        unregisterAction(cancelRequestAction.name);
        NEURO.statusBarItem!.tooltip = 'No active request';
        NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.foreground');
        NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
    }
}

/**
 * Creates a new RCE request and attaches it to NEURO.
 * @param prompt The prompt to be displayed in the notification.
 * @param callback The callback function to be executed when the request is accepted.
 * @param actionData The action data associated with this request.
 * @param cancelEvents Optional array of disposables for cancellation events.
 * @param preview Optional preview effects function.
 */
export function createRceRequest(
    context: RCEContext,
): void {
    setActiveRequestContext(context);

    const promise = new Promise<void>((resolve) => {
        // we can't add any buttons to progress, so we have to add the accept link
        if (!context.request) {
            context.updateStatus('failure', 'Internal failure: Request not initialized before createRceRequest');
            return;
        }
        const request = context.request;
        const message = `${request.prompt} [Accept](command:neuropilot.acceptRceRequest)`;

        // this is null initially but will be assigned when a notification gets spawned
        let progress: vscode.Progress<{ message?: string; increment?: number }> | null = null;

        const progressStep = 100; // step progress bar every 100ms, looks completely smooth

        const timeoutDuration = CONFIG.requestExpiryTimeout;
        const hasTimeout = timeoutDuration && timeoutDuration > 0;
        // if there's no timeout we "don't pass" the increment, this makes the progress bar infinite
        const increment = hasTimeout ? progressStep / timeoutDuration * 100 : undefined;

        // keep track of the incremented value to correctly report progress when the notification gets attached
        let incremented = increment;

        let interval: NodeJS.Timeout | null = null;
        let timeout: NodeJS.Timeout | null = null;
        if (hasTimeout) {
            // if there's a timeout, we need to report progress
            interval = setInterval(() => {
                progress?.report({ message, increment });
                if (incremented)
                    incremented += increment!;
            }, progressStep);

            // actually handle the timeout
            timeout = setTimeout(() => {
                clearRceRequest(context);
                NEURO.client?.sendContext('Request expired.');
                context.updateStatus('timeout', `Timed out waiting for approval from ${CONNECTION.userName}`);
                context.done(false);
            }, timeoutDuration);
        }
        request.interval = interval;
        request.timeout = timeout;

        // this will be called on request resolution
        request.resolve = () => {
            if (request.resolved) return;
            request.resolved = true;
            if (interval)
                clearInterval(interval);
            if (timeout)
                clearTimeout(timeout);

            resolve();
        };

        request.attachNotification = async (p) => {
            // set internal progress to the one from the notification
            progress = p;
            // we need to set the prompt and report time passed if there's a timeout
            progress.report({ message, increment: incremented });

            // return this exact promise we're in so the notification closes on request resolution
            return promise;
        };
    });
}

/**
 * Reveals the RCE notification for the current request if it is not already visible.
 */
export function revealRceNotification(): void {
    const activeContext = getActiveRequestContext();
    const request = activeContext?.request;
    if (!request)
        return;

    // don't show the notification if it's already open
    if (request.notificationVisible)
        return;

    request.notificationVisible = true;
    if (!ACTIONS.disablePreviewEffects && activeContext.action.preview) {
        activeContext.lifecycle.preview = activeContext.action.preview(activeContext);
    }

    // weirdly enough, a "notification" isn't actually a thing in vscode.
    // it's either a message, or in this case, progress report that takes shape of a notification
    // this is a workaround to show a notification that can be dismissed programmatically
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
        },
        (progress, cancellationToken) => {
            // handle manual cancellation
            cancellationToken.onCancellationRequested(() => {
                denyRceRequest();
            });

            return request.attachNotification(progress);
        },
    );
}

/**
 * Accepts the current RCE request and executes the callback function.
 * If there is no request to accept, an error message is shown to the user.
 */
export async function acceptRceRequest(): Promise<void> {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to accept.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has accepted your request.`);

    const actionData = activeContext.data;
    activeContext.updateStatus('pending', 'Executing...');

    // Clear timers and cancel events before handler execution to prevent them from triggering mid-execution
    activeContext.clearPreHandlerResources();

    try {
        const result = await activeContext.action.handler(activeContext);
        switch (result.success) {
            case 'retry': {
                activeContext.updateStatus('failure', result.historyNote);
                NEURO.client?.sendContext(result.message ? 'Action failed: ' + result.message : '\nPlease retry the action.');
                activeContext.done(false);
                break;
            }
            default: {
                if (result.historyNote) activeContext.updateStatus(result.success, result.historyNote);
                const messageString = result.success === 'failure' ? result.message ? 'Action failed: ' + result.message : 'Action failed.' : result.message ?? 'Action successful.'; // this needs to be more reasonable to read
                NEURO.client?.sendContext(messageString);
                break;
            }
        }
        activeContext.done(result.success === 'success');
    } catch (erm: unknown) {
        const actionName = actionData.name;
        notifyOnCaughtException(actionName, erm);
        clearActionForce();
        NEURO.client?.sendActionResult(actionData.id, true, `An error occurred while executing the action "${actionName}". You can retry if you like, but it may be better to ask ${CONNECTION.userName} to check what's up.`);

        // Track execution failure
        activeContext.updateStatus('failure', 'Uncaught exception while executing action');
        activeContext.done(false);
    }

    clearRceRequest(activeContext);
}

/**
 * Denies the current RCE request and clears the request object.
 * If there is no request to deny, an error message is shown to the user.
 */
export function denyRceRequest(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to deny.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has denied your request.`);

    // Track denial
    updateActionStatus(
        activeContext.data,
        'denied',
        `Denied by ${CONNECTION.userName}`,
    );

    clearRceRequest(activeContext);
    activeContext.done(false);
}

/**
 * Adds multiple actions to the RCE system.
 * @param actions The actions to add.
 * @param register Whether to register the actions with Neuro immediately if the permissions allow.
 */
export function addActions(actions: RCEAction[], register = true): void {
    const actionsToAdd = actions.filter(a => !ACTIONS_ARRAY.some(existing => existing.name === a.name));
    const actionsNotToAdd = actions.filter(a => !actionsToAdd.includes(a));
    if (actionsNotToAdd.length > 0) {
        logOutput('WARNING', `Tried to add actions that are already registered: ${actionsNotToAdd.map(a => a.name).join(', ')}`);
    }
    ACTIONS_ARRAY.push(...actionsToAdd);
    if (register && NEURO.connected) {
        const actionNames = actionsToAdd.map(a => a.name);
        const actionsToRegister = actionNames
            .map(name => ACTIONS_ARRAY.find(a => a.name === name)!)
            .filter((action) => getPermissionLevel(action.name) && action.registerCondition?.() !== false)
            .map(stripToAction);
        actionsToRegister.forEach(a => REGISTERED_ACTIONS.add(a.name));
        if (actionsToRegister.length > 0)
            NEURO.client?.registerActions(actionsToRegister);
    }
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Removes multiple actions from the registry.
 * @param actionNames The names of the actions to remove.
 */
export function removeActions(actionNames: string[]): void {
    for (const actionName of actionNames) {
        const actionIndex = ACTIONS_ARRAY.findIndex(a => a.name === actionName);
        if (actionIndex !== -1) {
            ACTIONS_ARRAY.splice(actionIndex, 1);
        }
    }
    if (NEURO.connected) {
        NEURO.client?.unregisterActions(actionNames);
        actionNames.forEach(a => REGISTERED_ACTIONS.delete(a));
    }
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Registers an action with Neuro.
 * The action to register must already be added to the registry via {@link addActions}.
 * Will only register the action if it is not already registered.
 * @param actionName The name of the action to register.
 */
export function registerAction(actionName: string): void {
    const action = ACTIONS_ARRAY.find(a => a.name === actionName);
    if (action && NEURO.connected && !REGISTERED_ACTIONS.has(action.name)) {
        NEURO.client!.registerActions([stripToAction(action)]);
        REGISTERED_ACTIONS.add(action.name);
        NEURO.viewProviders.actions?.refreshActions();
    }
}

/**
 * Unregisters an action from Neuro.
 * @param actionName The name of the action to unregister.
 */
export function unregisterAction(actionName: string): void {
    NEURO.client?.unregisterActions([actionName]);
    REGISTERED_ACTIONS.delete(actionName);
    NEURO.viewProviders.actions?.refreshActions();
}

export function unregisterAllActions(): void {
    const actionNames = Array.from(REGISTERED_ACTIONS);
    NEURO.client?.unregisterActions(actionNames);
    REGISTERED_ACTIONS.clear();
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Reregisters all actions with the Neuro API.
 * @param conservative Only reregister as necessary.
 */
export function reregisterAllActions(conservative: boolean): void {
    // Can't reregister if no client is connected
    if (!NEURO.connected) return;

    const permissions = getAllPermissions();

    // Apply action force permission override
    applyActionForcePermissionOverride(permissions);

    const actionsToUnregister = conservative
        ? ACTIONS_ARRAY
            .filter(a => REGISTERED_ACTIONS.has(a.name) && !shouldBeRegistered(a))
            .map(a => a.name)
        : ACTIONS_ARRAY.map(a => a.name);

    // Unregister actions
    if (actionsToUnregister.length > 0)
        NEURO.client?.unregisterActions(actionsToUnregister);
    actionsToUnregister.forEach(a => REGISTERED_ACTIONS.delete(a));

    // Determine which actions to register
    const actionsToRegister = ACTIONS_ARRAY
        // Skip actions that are already registered
        .filter(a => !REGISTERED_ACTIONS.has(a.name))
        .filter(x => shouldBeRegistered(x, permissions))
        .map(stripToAction);

    actionsToRegister.forEach(a => REGISTERED_ACTIONS.add(a.name));

    // Register the actions with Neuro
    if (actionsToRegister.length > 0)
        NEURO.client?.registerActions(actionsToRegister);

    NEURO.viewProviders.actions?.refreshActions();
    return;
}

/**
 * Applies the current action force's permission override to a given permissions object.
 * **This modifies the permissions object in-place**.
 * @param permissions The permissions to apply the action force override to.
 * @param params The action force parameters to apply. If not provided, will use {@link NEURO.currentActionForce}.
 * @returns A reference to the permissions object.
 */
function applyActionForcePermissionOverride(permissions: Record<string, PermissionLevel>, params?: ActionForceParams): Record<string, PermissionLevel> {
    const realParams = params ?? NEURO.currentActionForce;
    if (realParams?.overridePermissions !== undefined) {
        // logOutput('INFO', `Reregistering actions with override permission level ${realParams.overridePermissions} due to active action force.`);
        if (typeof realParams.overridePermissions === 'object') {
            for (const actionName in realParams.overridePermissions) {
                permissions[actionName] = realParams.overridePermissions[actionName];
            }
        }
        else {
            for (const actionName of realParams.actionNames) {
                permissions[actionName] = realParams.overridePermissions;
            }
        }
    }
    return permissions;
}

/**
 * Check whether an action should be registered with Neuro.
 * @param action The action to check.
 * @param permissions The permissions to check against. If not provided, will use the current permissions via {@link getAllPermissions}.
 * @returns `true` if the action should be registered, `false` if not.
 */
function shouldBeRegistered(action: RCEAction, permissions?: Record<string, PermissionLevel>): boolean {
    if (!permissions) {
        permissions = getAllPermissions();
        applyActionForcePermissionOverride(permissions);
    }
    // Non-auto-registered actions should stay unregistered
    if (action.autoRegister === false && !REGISTERED_ACTIONS.has(action.name))
        return false;
    // Check the register condition
    if (action.registerCondition && !action.registerCondition())
        return false;
    // Check permissions
    const effectivePermission = permissions[action.name] ?? action.defaultPermission ?? PermissionLevel.OFF;
    return effectivePermission !== PermissionLevel.OFF;
}

export function canForceActions(): boolean {
    return NEURO.connected && NEURO.currentActionForce === null;
}

/**
 * Wrapper function for {@link NeuroClient.forceActions} that uses the RCE system to register and unregister the required actions.
 * Actions must be registered with the RCE system via {@link addActions} before they can be forced with this function.
 * @param params The parameters for forcing actions. A (possibly modified) copy of this object will be stored in {@link NEURO.currentActionForce} for the duration of the force.
 * @param strict If true, will fail if any of the specified actions are not / will not be registered with RCE (e.g. due to {@link RCEAction.registerCondition registerCondition} or {@link RCEAction.autoRegister autoRegister}: false).
 * If false, will filter out those actions and proceed if there is at least one action remaining.
 * @see {@link NeuroClient.forceActions} for the other parameters' documentation.
 */
export function tryForceActions(params: ActionForceParams, strict = false): boolean {
    if (!canForceActions())
        return false;
    if (params.actionNames.length === 0) {
        logOutput('WARNING', 'Tried to force an empty array of actions. Aborting action force.');
        return false;
    }

    // Verify that all actions are registered with RCE
    if (!params.actionNames.every(name => ACTIONS_ARRAY.some(a => a.name === name))) {
        logOutput('WARNING', 'One or more actions in the action force are not registered with RCE. Aborting action force.');
        return false;
    }

    // Create a copy to prevent external mutation
    // Leaving the array reference intact since it's set later in the function anyway
    const paramsCopy = { ...params };

    // Filter out actions that will not be registered by reregisterAllActions
    const permissions = getAllPermissions();
    applyActionForcePermissionOverride(permissions, params);
    paramsCopy.actionNames = paramsCopy.actionNames
        .filter(name => shouldBeRegistered(getAction(name)!, permissions));

    // Abort if no actions are left after filtering
    if (paramsCopy.actionNames.length === 0) {
        logOutput('WARNING', 'No actions left to force after filtering for registration conditions and permissions. Aborting action force.');
        return false;
    }
    // If strict mode is enabled, abort any actions were filtered out
    else if (strict && paramsCopy.actionNames.length !== params.actionNames.length) {
        logOutput('WARNING', 'Some actions were filtered out while strict mode is enabled. Aborting action force.');
        return false;
    }

    NEURO.currentActionForce = paramsCopy;

    // Register actions with overridden permissions if specified
    if (params.overridePermissions) {
        reregisterAllActions(true);
    }

    NEURO.client?.forceActions(paramsCopy.query, paramsCopy.actionNames, paramsCopy.state, paramsCopy.ephemeral_context, paramsCopy.priority);

    return true;
}

/** Clears the current action force, if any. */
function clearActionForce(): void {
    if (!NEURO.currentActionForce) return;
    NEURO.currentActionForce = null;
    reregisterAllActions(true);
}

/**
 * Aborts the current action force by unregistering its actions,
 * and then re-registering all actions with their original permissions.
 * There is a slight delay between the unregistration and reregistration to
 * ensure they arrive in the correct order.
 * @see {@link https://github.com/VedalAI/neuro-sdk/issues/14}
 */
export async function abortActionForce(): Promise<void> {
    NEURO.client?.unregisterActions(NEURO.currentActionForce?.actionNames ?? []);
    NEURO.currentActionForce = null; // Not using clearActionForce here since we want to delay re-registration.
    await new Promise(resolve => setTimeout(resolve, 250)); // Wait for 250ms
    reregisterAllActions(true);
}

/**
 * Gets the list of registered actions.
 * Do not modify the actions in the returned array directly.
 * @returns The list of registered actions.
 */
export function getActions(): readonly RCEAction[] {
    return ACTIONS_ARRAY;
}

export function getAction(actionName: string): RCEAction | undefined {
    return ACTIONS_ARRAY.find(a => a.name === actionName);
}

export function getExtendedActionsInfo(): ExtendedActionInfo[] {
    const configuration = vscode.workspace.getConfiguration('neuropilot');
    const { workspaceValue, globalValue } = configuration.inspect<Record<string, string>>('actionPermissions') || {};
    return ACTIONS_ARRAY.map(action => {
        const configuredWorkspacePermission = workspaceValue?.[action.name] !== undefined ? stringToPermissionLevel(workspaceValue[action.name]) : undefined;
        const configuredGlobalPermission = globalValue?.[action.name] !== undefined ? stringToPermissionLevel(globalValue[action.name]) : undefined;
        return {
            action,
            isRegistered: REGISTERED_ACTIONS.has(action.name),
            effectivePermissionLevel: getPermissionLevel(action.name),
            configuredWorkspacePermission,
            configuredGlobalPermission,
            isConfigured: configuredWorkspacePermission !== undefined || configuredGlobalPermission !== undefined,
        } satisfies ExtendedActionInfo;
    });
}

function processResult(result: ActionHandlerResult): { status: 'success' | 'failure'; statusMessage: string; contextMessage: string | undefined } {
    const status = result.success === 'success' ? 'success' : 'failure';
    let statusMessage: string;
    let contextMessage: string | undefined;

    const failedStatusMessage = result.historyNote ? 'Action failed: ' + result.historyNote : 'Action failed.';
    const failedContextMessage = result.message ? 'Action failed: ' + result.message : 'Action failed.';
    if (result.success === 'success') {
        statusMessage = result.historyNote ?? 'Action succeeded.';
        contextMessage = result.message;
    } else if (result.success === 'failure') {
        statusMessage = failedStatusMessage;
        contextMessage = failedContextMessage;
    } else { // result.success === 'retry'
        statusMessage = failedStatusMessage + '\nRequesting retry.';
        contextMessage = failedContextMessage + '\nPlease retry the action.';
    }
    return { status, statusMessage, contextMessage };
}

type ActionStages = 'initializing'
    | 'validating schema'
    | 'running validators'
    | 'setting up cancel events'
    | 'executing handler'
    | 'creating Copilot request';

/**
 * RCE action handler code for unsupervised requests.
 * Intended to be used with something like `NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData, actionList, true))
 * @param actionData The action data from Neuro.
 */
export async function RCEActionHandler(actionData: ActionData) {
    // TODO: Maybe make something like this a queryable property of context / lifecycle
    let stage: ActionStages = 'initializing';
    let context: RCEContext | undefined;
    let alreadySentResult = false;
    function sendResult(message?: string, retry = false) {
        if (!alreadySentResult) {
            alreadySentResult = true;
            NEURO.client?.sendActionResult(context!.data.id, !retry, message);
        } else if (message) {
            NEURO.client?.sendContext(message);
        }
    }
    try {
        if (REGISTERED_ACTIONS.has(actionData.name)) {
            NEURO.actionHandled = true;

            // Start tracking execution immediately
            fireOnActionStart(actionData, 'Validating action...');

            context = new RCEContext(actionData);

            const effectivePermission = getPermissionLevel(context.action.name);
            if (effectivePermission === PermissionLevel.OFF) {
                clearActionForce();
                sendResult('Action failed: You don\'t have permission to execute this action.');
                context.updateStatus('denied', 'Permission denied');
                context.done(false);
                return;
            }

            if (context.action.contextSetupHook) {
                context.lifecycle.setupHooks = false;
                // TODO: Add documentation for handling if a value already exists in case of async race timing and all that
                const setupArray = [];
                for (const hook of context.action.contextSetupHook) {
                    setupArray.push(hook(context));
                }
                Promise.allSettled(setupArray).then(() => context!.lifecycle.setupHooks = true);
            }

            // Validate schema
            stage = 'validating schema';
            if (context.action.schema) {
                context.updateStatus('pending', 'Validating schema...');
                const schema = ACTIONS.experimentalSchemas ? context.action.schema ?? context.action.schemaFallback : context.action.schema;
                const schemaValidationResult = validate(actionData.params, schema, { required: true });
                if (!schemaValidationResult.valid) {
                    const messagesArray: string[] = [];
                    schemaValidationResult.errors.map((erm) => {
                        if (erm.stack.startsWith('instance.')) messagesArray.push(erm.stack.substring(9));
                        else messagesArray.push(erm.stack);
                    });
                    if (messagesArray.length === 0) messagesArray.push('Unknown schema validation error.');
                    const schemaFailures = `- ${messagesArray.join('\n- ')}`;
                    const message = 'Action failed, your inputs did not pass schema validation due to these problems:\n\n' + schemaFailures + '\n\nPlease pay attention to the schema and the above errors if you choose to retry.';
                    // Don't clear action force here since it should be retried
                    sendResult(message, true);
                    context.updateStatus('schema', `${messagesArray.length} schema validation rules failed`);
                    context.done(false);
                    return;
                }
            }

            // Validate custom
            stage = 'running validators';
            if (context.action.validators) {
                if (context.action.validators.sync) {
                    if (!context.lifecycle.validatorResults) {
                        context.lifecycle.validatorResults = {};
                    }
                    if (!context.lifecycle.validatorResults.sync) {
                        context.lifecycle.validatorResults.sync = [];
                    }
                    context.updateStatus('pending', 'Running validators...');
                    for (const validate of context.action.validators.sync) {
                        const actionResult = await validate(context);
                        if (!actionResult.success) {
                            context.lifecycle.validatorResults.sync.push(actionResult);
                            if (!(actionResult.retry ?? false))
                                clearActionForce();
                            sendResult(actionResult.message, !(actionResult.retry ?? false));
                            context.updateStatus(
                                'failure',
                                actionResult.historyNote ? `Validator failed: ${actionResult.historyNote}` : 'Validator failed' + (actionResult.retry ? '\nRequesting retry' : ''),
                            );
                            context.done(false);
                            return;
                        }
                    }
                }
                // implementation needs this to be moved to *after* setup of cancel events
                if (context.action.validators.async) logOutput('INFO', `Action "${actionData.name}" uses asynchronous validators, which have not been implemented yet.`);
            }

            // Set up cancel events
            // if (effectivePermission === PermissionLevel.AUTOPILOT && !context.action.validators?.async) {
            //     // blank for the sake of skipping through cancel event setup in this case
            //     // I could make one long `if` chain but I'm not insane enough
            // } else
            // TODO: revisit above later 
            if (ACTIONS.enableCancelEvents && context.action.cancelEvents) {
                stage = 'setting up cancel events';
                context.lifecycle.events = [];
                const eventListener = (eventObject: RCECancelEvent, eventData: unknown) => {
                    let createdReason: string;
                    let createdLogReason: string;
                    const reason = eventObject.reason;
                    if (typeof reason === 'string') {
                        createdReason = reason.trim();
                    } else if (typeof reason === 'function') {
                        createdReason = reason(actionData, eventData).trim();
                    } else {
                        createdReason = 'a cancellation event was fired.';
                    };
                    const logReason = eventObject.logReason;
                    if (typeof logReason === 'string') {
                        createdLogReason = logReason.trim();
                    } else if (typeof logReason === 'function') {
                        createdLogReason = logReason(actionData, eventData).trim();
                    } else {
                        createdLogReason = createdReason;
                    }
                    logOutput('WARNING', `${CONNECTION.nameOfAPI}'${CONNECTION.nameOfAPI.endsWith('s') ? '' : 's'} action ${context!.action.name} was cancelled because ${createdLogReason}`);
                    NEURO.client?.sendContext(`Your request was cancelled because ${createdReason}`);
                    context!.updateStatus('cancelled', `Cancelled because ${createdLogReason}`);
                    clearRceRequest(context!);
                    context!.done(false);
                };
                for (const eventObject of context.action.cancelEvents) {
                    const eventDetails = eventObject(context);
                    if (eventDetails) {
                        const subscription = eventDetails.event((eventData) => eventListener(eventDetails, eventData));
                        context.lifecycle.events.push(vscode.Disposable.from(subscription, eventDetails.disposable));
                    }
                }
            }

            if (effectivePermission === PermissionLevel.AUTOPILOT) {
                stage = 'executing handler';
                context.updateStatus('pending', 'Executing handler...');
                // Clear timers and cancel events before handler execution to prevent them from triggering mid-execution
                // TODO: It's probably better to avoid having to set up cancel events in the first place if possible (unless on async validators of course)
                context.clearPreHandlerResources();
                const result = context.action.handler(context);
                if (isThenable(result)) {
                    clearActionForce();
                    sendResult();

                    const resolvedResult = await result;
                    const { status, statusMessage, contextMessage } = processResult(resolvedResult);

                    // TODO: Add handling for forces on retry
                    context.updateStatus(status, statusMessage);
                    if (contextMessage)
                        NEURO.client?.sendContext(contextMessage);
                    context.done(resolvedResult.success === 'success');
                } else {
                    const resolvedResult = result as ActionHandlerResult;
                    const { status, statusMessage, contextMessage } = processResult(resolvedResult);

                    if (resolvedResult.success !== 'retry')
                        clearActionForce();
                    context.updateStatus(status, statusMessage);
                    sendResult(contextMessage, resolvedResult.success !== 'retry');
                    context.done(resolvedResult.success === 'success');
                }
            }
            else { // effectivePermission === PermissionLevel.COPILOT
                stage = 'creating Copilot request';
                if (getActiveRequestContext()?.request) {
                    clearActionForce();
                    sendResult('Action failed: Already waiting for permission to run another action.');
                    context.updateStatus('failure', 'Another action pending approval');
                    context.done(false);
                    return;
                }

                context.updateStatus('pending', `Waiting for approval from ${CONNECTION.userName}`);

                const prompt = (NEURO.currentController
                    ? NEURO.currentController
                    : 'The Neuro API server') +
                    ' wants to ' +
                    (typeof context.action.promptGenerator === 'string' ? context.action.promptGenerator : context.action.promptGenerator?.(context) ?? `execute ${context.action.name}.`).trim();

                context.request = {
                    prompt,
                    notificationVisible: false,
                    resolved: false,
                    resolve: () => { },
                    attachNotification: async () => { },
                };

                createRceRequest(
                    context,
                );

                NEURO.statusBarItem!.tooltip = new vscode.MarkdownString(prompt);
                registerAction(cancelRequestAction.name);
                NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.warningForeground');

                // Show the RCE dialog immediately if the config says so
                if (!ACTIONS.hideCopilotRequests)
                    revealRceNotification();

                // End of added code.
                clearActionForce();
                sendResult('Requested permission to run action.');
            }
        } // special case handler removed for cancel_request because `hidden` property was added
    } catch (erm: unknown) {
        const actionName = actionData.name;
        notifyOnCaughtException(actionName, erm);
        sendResult(`An error occurred while ${stage} (action "${actionName}"). You can retry if you like, but it may be better to ask Vedal to check what's up.`);

        // Track execution error
        updateActionStatus(actionData, 'exception', `Uncaught exception while ${stage}`);

        // Clean up resources to prevent timeout from firing and cancel events from triggering
        if (context) {
            context.clearPreHandlerResources();
            clearRceRequest(context);
            context.done(false);
        }
        return;
    }
}

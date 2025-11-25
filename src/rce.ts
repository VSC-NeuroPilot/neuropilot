/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 */

import * as vscode from 'vscode';
import { RCEAction, stripToAction } from '@/neuro_client_helper';
import { NEURO } from '@/constants';
import { logOutput, notifyOnCaughtException } from '@/utils';
import { ACTIONS as ACTIONS_CONFIG, CONFIG, CONNECTION, getAllPermissions, getPermissionLevel, stringToPermissionLevel } from '@/config';
import { PermissionLevel, ActionData } from '@vsc-neuropilot/api-types';
import { validate } from 'jsonschema';
import type { RCECancelEvent } from '@events/utils';

export const CATEGORY_MISC = 'Miscellaneous';

const ACTIONS: RCEAction[] = [];
const REGISTERED_ACTIONS: Set<string> = /* @__PURE__ */ new Set<string>();

/**
 * RCE request object
 */
export interface RceRequest {
    /**
     * The prompt that describes the request.
     */
    prompt: string;
    /**
     * The callback function to be executed when the request is accepted.
     */
    callback: () => string | undefined | void;
    /**
     * Resolve the request, closing all attached notifications and clearing timers.
     */
    resolve: () => void;
    /**
     * Attach a `window.showProgress` notification to the request, allowing it to be dismissed on request resolution.
     * @param progress The progress object from `window.withProgress` to report the prompt and time passed to.
     * @returns A promise that resolves when the request is resolved.
     */
    attachNotification: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>;
    /**
     * Whether the notification has been revealed already.
     */
    notificationVisible: boolean;
    /**
     * Disposable events
     */
    cancelEvents?: vscode.Disposable[]
    /**
     * The action data associated with this request.
     */
    actionData: ActionData;
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
};

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(_actionData: ActionData): string | undefined {
    if (!NEURO.rceRequest) {
        return 'No active request to cancel.';
    }
    clearRceRequest();
    return 'Request cancelled.';
}

/**
 * RCE's emergency shutdown component
 * Automatically clears the RCE dialog and tell Neuro her requests was cancelled.
 * Only runs if there is an RCE callback in NEURO.
 */
export function emergencyDenyRequests(): void {
    if (!NEURO.rceRequest) {
        return;
    }
    clearRceRequest();
    logOutput('INFO', `Cancelled ${NEURO.rceRequest.callback} due to emergency shutdown.`);
    NEURO.client?.sendContext('Your last request was denied.');
    vscode.window.showInformationMessage(`The last request from ${NEURO.currentController} has been denied automatically.`);
}

export function clearRceRequest(): void {
    if (!NEURO.rceRequest) return;
    NEURO.rceRequest.resolve();
    if (NEURO.rceRequest.cancelEvents) {
        for (const disposable of NEURO.rceRequest.cancelEvents) {
            try { disposable.dispose(); } catch (erm: unknown) { logOutput('ERROR', `Failed to dispose a cancellation event: ${erm}. This could contribute to a memory leak.`); }
        }
    }
    NEURO.rceRequest = null;
    NEURO.client?.unregisterActions([cancelRequestAction.name]);
    NEURO.statusBarItem!.tooltip = 'No active request';
    NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.foreground');
    NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
}

/**
 * Creates a new RCE request and attaches it to NEURO.
 * @param prompt The prompt to be displayed in the notification.
 * @param callback The callback function to be executed when the request is accepted.
 * @param actionData The action data associated with this request.
 * @param cancelEvents Optional array of disposables for cancellation events.
 */
export function createRceRequest(
    prompt: string,
    callback: () => string | undefined | void,
    actionData: ActionData,
    cancelEvents?: vscode.Disposable[],
): void {
    NEURO.rceRequest = {
        prompt,
        callback,
        notificationVisible: false,

        // these immediately get replaced synchronously, this is just so we don't have them be nullable in the type
        resolve: () => { },
        attachNotification: async () => { },
        cancelEvents,
        actionData,
    };

    const promise = new Promise<void>((resolve) => {
        // we can't add any buttons to progress, so we have to add the accept link
        const message = `${NEURO.rceRequest!.prompt} [Accept](command:neuropilot.acceptRceRequest)`;

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
                clearRceRequest();
                NEURO.client?.sendContext('Request expired.');
            }, timeoutDuration);
        }

        // this will be called on request resolution
        NEURO.rceRequest!.resolve = () => {
            if (interval)
                clearInterval(interval);
            if (timeout)
                clearTimeout(timeout);

            resolve();
        };

        NEURO.rceRequest!.attachNotification = async (p) => {
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
    if (!NEURO.rceRequest)
        return;

    // don't show the notification if it's already open
    if (NEURO.rceRequest.notificationVisible)
        return;

    NEURO.rceRequest.notificationVisible = true;

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

            return NEURO.rceRequest!.attachNotification(progress);
        },
    );
}

/**
 * Accepts the current RCE request and executes the callback function.
 * If there is no request to accept, an error message is shown to the user.
 */
export function acceptRceRequest(): void {
    if (!NEURO.rceRequest) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to accept.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has accepted your request.`);

    try {
        const result = NEURO.rceRequest.callback();
        if (result)
            NEURO.client?.sendContext(result);
    } catch (erm: unknown) {
        const actionName = NEURO.rceRequest.actionData.name;
        notifyOnCaughtException(actionName, erm);
        NEURO.client?.sendActionResult(NEURO.rceRequest.actionData.id, true, `An error occurred while executing the action "${actionName}". You can retry if you like, but it may be better to ask ${CONNECTION.userName} to check what's up.`);
    }

    clearRceRequest();
}

/**
 * Denies the current RCE request and clears the request object.
 * If there is no request to deny, an error message is shown to the user.
 */
export function denyRceRequest(): void {
    if (!NEURO.rceRequest) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to deny.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has denied your request.`);

    clearRceRequest();
}

/**
 * Adds multiple actions to the RCE system.
 * @param actions The actions to add.
 * @param register Whether to register the actions with Neuro immediately if the permissions allow.
 */
export function addActions(actions: RCEAction[], register = true): void {
    const actionsToAdd = actions.filter(a => !ACTIONS.some(existing => existing.name === a.name));
    const actionsNotToAdd = actions.filter(a => !actionsToAdd.includes(a));
    if (actionsNotToAdd.length > 0) {
        logOutput('WARN', `Tried to add actions that are already registered: ${actionsNotToAdd.map(a => a.name).join(', ')}`);
    }
    ACTIONS.push(...actionsToAdd);
    if (register && NEURO.connected) {
        const actionNames = actionsToAdd.map(a => a.name);
        const actionsToRegister = actionNames
            .map(name => ACTIONS.find(a => a.name === name)!)
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
        const actionIndex = ACTIONS.findIndex(a => a.name === actionName);
        if (actionIndex !== -1) {
            ACTIONS.splice(actionIndex, 1);
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
 * The action to register must already be added to the registry via {@link addAction} or {@link addActions}.
 * Will only register the action if it is not already registered.
 * @param actionName The name of the action to register.
 */
export function registerAction(actionName: string): void {
    const action = ACTIONS.find(a => a.name === actionName);
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
    const actionsToUnregister = conservative
        ? ACTIONS
            .filter(a => REGISTERED_ACTIONS.has(a.name) && !shouldBeRegistered(a))
            .map(a => a.name)
        : ACTIONS.map(a => a.name);

    // Unregister actions
    if (actionsToUnregister.length > 0)
        NEURO.client?.unregisterActions(actionsToUnregister);
    actionsToUnregister.forEach(a => REGISTERED_ACTIONS.delete(a));

    // Determine which actions to register
    const actionsToRegister = ACTIONS
        // Skip actions that are already registered
        .filter(a => !REGISTERED_ACTIONS.has(a.name))
        .filter(shouldBeRegistered)
        .map(stripToAction);

    actionsToRegister.forEach(a => REGISTERED_ACTIONS.add(a.name));

    // Register the actions with Neuro
    if (actionsToRegister.length > 0)
        NEURO.client?.registerActions(actionsToRegister);

    NEURO.viewProviders.actions?.refreshActions();
    return;

    function shouldBeRegistered(action: RCEAction): boolean {
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
}

/**
 * Gets the list of registered actions.
 * Do not modify the actions in the returned array directly.
 * @returns The list of registered actions.
 */
export function getActions(): readonly RCEAction[] {
    return ACTIONS;
}

export function getAction(actionName: string): RCEAction | undefined {
    return ACTIONS.find(a => a.name === actionName);
}

export function getExtendedActionsInfo(): ExtendedActionInfo[] {
    const configuration = vscode.workspace.getConfiguration('neuropilot');
    const { workspaceValue, globalValue } = configuration.inspect<Record<string, string>>('actionPermissions') || {};
    return ACTIONS.map(action => {
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

/**
 * RCE action handler code for unsupervised requests.
 * Intended to be used with something like `NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData, actionList, true))
 * @param actionData The action data from Neuro.
 * @param actionList The list of actions currently registered.
 * @param checkTasks Whether or not to check for tasks.
 */
export async function RCEActionHandler(actionData: ActionData) {
    try {
        if (REGISTERED_ACTIONS.has(actionData.name)) {
            NEURO.actionHandled = true;

            const action = getAction(actionData.name)!;

            const effectivePermission = getPermissionLevel(action.name);
            if (effectivePermission === PermissionLevel.OFF) {
                NEURO.client?.sendActionResult(actionData.id, true, 'Action failed: You don\'t have permission to execute this action.');
                return;
            }

            // Validate schema
            if (action.schema) {
                const schemaValidationResult = validate(actionData.params, action.schema, { required: true });
                if (!schemaValidationResult.valid) {
                    const messagesArray: string[] = [];
                    schemaValidationResult.errors.map((erm) => {
                        if (erm.stack.startsWith('instance.')) messagesArray.push(erm.stack.substring(9));
                        else messagesArray.push(erm.stack);
                    });
                    if (messagesArray.length === 0) messagesArray.push('Unknown schema validation error.');
                    const schemaFailures = `- ${messagesArray.join('\n- ')}`;
                    const message = 'Action failed, your inputs did not pass schema validation due to these problems:\n\n' + schemaFailures + '\n\nPlease pay attention to the schema and the above errors if you choose to retry.';
                    NEURO.client?.sendActionResult(actionData.id, false, message);
                    return;
                }
            }

            // Validate custom
            if (action.validators) {
                for (const validate of action.validators) {
                    const actionResult = await validate(actionData);
                    if (!actionResult.success) {
                        NEURO.client?.sendActionResult(actionData.id, !(actionResult.retry ?? false), actionResult.message);
                        return;
                    }
                }
            }

            const eventArray: vscode.Disposable[] = [];

            if (ACTIONS_CONFIG.enableCancelEvents && action.cancelEvents) {
                const eventListener = (eventObject: RCECancelEvent) => {
                    let createdReason: string;
                    let createdLogReason: string;
                    const reason = eventObject.reason;
                    if (typeof reason === 'string') {
                        createdReason = reason.trim();
                    } else if (typeof reason === 'function') {
                        createdReason = reason(actionData).trim();
                    } else {
                        createdReason = 'a cancellation event was fired.';
                    };
                    const logReason = eventObject.logReason;
                    if (typeof logReason === 'string') {
                        createdLogReason = logReason.trim();
                    } else if (typeof logReason === 'function') {
                        createdLogReason = logReason(actionData).trim();
                    } else {
                        createdLogReason = createdReason;
                    }
                    logOutput('WARN', `${CONNECTION.nameOfAPI}'${CONNECTION.nameOfAPI.endsWith('s') ? '' : 's'} action ${action.name} was cancelled because ${createdLogReason}`);
                    NEURO.client?.sendContext(`Your request was cancelled because ${createdReason}`);
                    clearRceRequest();
                };
                for (const eventObject of action.cancelEvents) {
                    const eventDetails = eventObject(actionData);
                    if (eventDetails) {
                        eventArray.push(eventDetails.event(() => eventListener(eventDetails)), eventDetails.disposable);
                    }
                }
            }

            if (effectivePermission === PermissionLevel.AUTOPILOT) {
                for (const d of eventArray) d.dispose();
                const result = action.handler(actionData);
                NEURO.client?.sendActionResult(actionData.id, true, result ?? undefined);
            }
            else { // effectivePermission === PermissionLevel.COPILOT
                if (NEURO.rceRequest) {
                    NEURO.client?.sendActionResult(actionData.id, true, 'Action failed: Already waiting for permission to run another action.');
                    return;
                }

                const prompt = (NEURO.currentController
                    ? NEURO.currentController
                    : 'The Neuro API server') +
                ' wants to ' +
                (typeof action.promptGenerator === 'string' ? action.promptGenerator : action.promptGenerator(actionData)).trim();

                createRceRequest(
                    prompt,
                    () => action.handler(actionData),
                    actionData,
                    eventArray,
                );

                NEURO.statusBarItem!.tooltip = new vscode.MarkdownString(prompt);
                NEURO.client?.registerActions([stripToAction(cancelRequestAction)]);
                NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.warningForeground');

                // Show the RCE dialog immediately if the config says so
                if (!ACTIONS_CONFIG.hideCopilotRequests)
                    revealRceNotification();

                // End of added code.
                NEURO.client?.sendActionResult(actionData.id, true, 'Requested permission to run action.');
            }
        }
    } catch(erm: unknown) {
        const actionName = actionData.name;
        notifyOnCaughtException(actionName, erm);
        NEURO.client?.sendActionResult(actionData.id, true, `An error occurred while executing the action "${actionName}". You can retry if you like, but it may be better to ask Vedal to check what's up.`);
        return;
    }
}

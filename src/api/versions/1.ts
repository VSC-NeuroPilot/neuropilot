import * as vscode from 'vscode';
import { logOutput, isPathNeuroSafe, getVirtualCursor, setVirtualCursor, getPositionContext, formatContext } from '../../utils';
import { APIv1 } from '@vsc-neuropilot/api-types/api/v1';
import { ConnectionStatus, CursorPositionContextStyle, NeuroClient, NeuroPositionContext, NeuroPositionContextOptions, RCEAction, RCECancelEvent, RCECancelEventInitializer } from '@vsc-neuropilot/api-types';
import { COMPANIONS, CompanionToken } from '..';
import { addActions, CompanionRCEAction, getAction, getActions, isActionRegistered, registerActions, removeActions, reregisterAllActions, unregisterActions } from '~/src/rce';
import { RCECancelEvent as RCECancelEventImpl } from '~/src/events/utils';
import { NEURO } from '~/src/constants';

// Internal storage for registered extensions
// interface ExtensionRegistration {
//     id: string;
//     info: CompanionExtension;
//     actionPrefix: string;
//     token: string;
//     displayName: string;
//     actions: Map<string, RCEAction>;
//     onRegistrationCallbacks: (() => RCEAction[])[];
//     onUnregistrationCallbacks: (() => string[])[];
// }

// Utility functions
function actionNameFilter(actionName: string, token: CompanionToken): boolean {
    const action = getAction(actionName);
    // Checking for undefined is required, otherwise setting the token to undefined
    // would allow modifying vanilla actions
    return !!action
        && (action as CompanionRCEAction).registeredBy !== undefined
        && (action as CompanionRCEAction).registeredBy === token;
}

// function generateToken(): string {
//     return `ext_${Date.now()}_${Math.random().toString(36).substring(2)}`;
// }

// function validateToken(token: CompanionToken): ExtensionRegistration {
//     const extensionId = tokenToExtension.get(token);
//     if (!extensionId) {
//         throw new Error('Invalid or expired token');
//     }

//     const registration = registeredExtensions.get(extensionId);
//     if (!registration) {
//         throw new Error('Extension not found');
//     }

//     return registration;
// }

// function generateActionPrefix(nameOnActions: string): string {
//     // Ensure the prefix is unique
//     const prefix = nameOnActions.toLowerCase().replace(/[^a-z0-9]/g, '_');
//     let counter = 1;
//     let finalPrefix = prefix;

//     while ([...registeredExtensions.values()].some(ext => ext.actionPrefix === finalPrefix)) {
//         finalPrefix = `${prefix}_${counter}`;
//         counter++;
//     }

//     return finalPrefix;
// }

enum Permission {
    ManageActions,
    ManageVirtualCursor,
    DirectNeuroClientAccess,
}

// It may be possible to change this to a decorator but I'm not sure it would work
// see commented decorator factory below
function validate(token: CompanionToken, _permissions: Permission[]): boolean {
    // TODO: Implement permission checking
    return COMPANIONS.has(token);
}

// /**
//  * Decorator to add validation to API methods.
//  * @param permissions Permissions needed for this method.
//  */
// function validated(...permissions: Permission[]) {
//     /** @this APIv1Impl */
//     return function a(target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
//         const originalMethod: (...args: unknown[]) => unknown = descriptor.value;
//         descriptor.value = function (...args: unknown[]) {
//             // Type of this is APIv1Impl, the token is private so we need to cast
//             // eslint-disable-next-line @typescript-eslint/no-explicit-any
//             if (!validate((this as any)._token, permissions)) {
//                 if (permissions.length === 0) {
//                     logOutput('ERROR', 'Token does not exist.');
//                 } else {
//                     logOutput('ERROR', `No permission to execute ${propertyKey}.`);
//                 }
//                 return;
//             }
//             return originalMethod.apply(this, args);
//         };
//         return descriptor;
//     };
// }

export class APIv1Impl implements APIv1 {
    version = 1 as const;
    constructor(private _token: CompanionToken) {
        this._token = _token;
    }
    deactivateExtension(message?: string): void {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return;
        }
        COMPANIONS.delete(this._token);
        removeActions(
            getActions()
                .filter(action => actionNameFilter(action.name, this._token))
                .map(a => a.name),
        );
        if (message) {
            logOutput('INFO', `Extension deactivated: ${message}`);
        }
    }
    // modifyExtensionMeta(data: ModifyMetadata): ModifyMetadata {
    //     throw new Error('Method not implemented.');
    // }
    addActions(actions: RCEAction[], register = true): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }

        // Attach token to each action for tracking
        addActions(actions.map(action => ({...action, registeredBy: this._token} satisfies CompanionRCEAction)), register);
    }
    removeActions(actionNames: string[]): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }

        const actionsToRemove = actionNames.filter(name => actionNameFilter(name, this._token));
        if (actionsToRemove.length > 0) {
            removeActions(actionsToRemove);
        }
    }
    registerActions(actionNames: string[]): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }

        const actionsToRegister = actionNames.filter(name => actionNameFilter(name, this._token));
        if (actionsToRegister.length > 0) {
            registerActions(actionsToRegister);
        }
    }
    unregisterActions(actionNames: string[]): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }
        const actionsToUnregister = actionNames.filter(name => actionNameFilter(name, this._token));
        if (actionsToUnregister.length > 0) {
            removeActions(actionsToUnregister);
        }
    }
    unregisterAllActions(): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }
        const actionsToUnregister = getActions()
            .filter(action => actionNameFilter(action.name, this._token))
            .map(a => a.name);
        if (actionsToUnregister.length > 0) {
            unregisterActions(actionsToUnregister);
        }
    }
    reregisterAllActions(): void {
        if (!validate(this._token, [Permission.ManageActions])) {
            logOutput('ERROR', 'No permission to manage actions.');
            return;
        }

        reregisterAllActions(true, this._token);
    }
    getActions(): RCEAction[] {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return [];
        }
        return getActions().filter(action => actionNameFilter(action.name, this._token));
    }
    isActionRegistered(actionName: string): boolean {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return false;
        }

        const action = getAction(actionName);
        return action !== undefined
            && actionNameFilter(actionName, this._token)
            && isActionRegistered(actionName);
    }
    isPathNeuroSafe(path: string): boolean {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return false;
        }
        return isPathNeuroSafe(path);
    }
    getVirtualCursor(): vscode.Position | null | undefined {
        if (!validate(this._token, [Permission.ManageVirtualCursor])) {
            logOutput('ERROR', 'No permission to manage virtual cursor.');
            return undefined;
        }
        return getVirtualCursor();
    }
    setVirtualCursor(position: vscode.Position): void {
        if (!validate(this._token, [Permission.ManageVirtualCursor])) {
            logOutput('ERROR', 'No permission to manage virtual cursor.');
            return;
        }
        // Prevent exploit through passing (null as any)
        if (typeof position !== 'object') {
            logOutput('ERROR', 'Invalid position object.');
            return;
        }
        setVirtualCursor(position);
    }
    createCancelEvent<T = unknown>(init: RCECancelEventInitializer<T>): RCECancelEvent<T> {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            throw new Error('Token does not exist.');
        }
        return new RCECancelEventImpl<T>(init);
    }
    sendContext(context: string, silent?: boolean): void {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return;
        }

        NEURO.client?.sendContext(context, silent);
    }
    // sendResult(message?: string, success?: boolean): void {
    //     throw new Error('Method not implemented.');
    // }
    // forceNeuroActions(query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void {
    //     throw new Error('Method not implemented.');
    // }
    getPositionContext(document: vscode.TextDocument, options: NeuroPositionContextOptions | vscode.Position): NeuroPositionContext {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            throw new Error('Token does not exist.');
        }

        return getPositionContext(document, options);
    }
    formatContext(context: NeuroPositionContext, overrideCursorStyle?: CursorPositionContextStyle): string {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            throw new Error('Token does not exist.');
        }
        return formatContext(context, overrideCursorStyle);
    }
    getConnectionStatus(): ConnectionStatus {
        if (!validate(this._token, [])) {
            logOutput('ERROR', 'Token does not exist.');
            return ConnectionStatus.Disconnected;
        }
        // TODO: Not sure how / if we want to do the other ones, considering switching this to a boolean
        if (NEURO.connected)
            return ConnectionStatus.Connected;
        return ConnectionStatus.Disconnected;
    }
    getNeuroClient(): NeuroClient | null {
        if (!validate(this._token, [Permission.DirectNeuroClientAccess])) {
            logOutput('ERROR', 'No permission to access Neuro client directly.');
            throw new Error('No permission to access Neuro client directly.');
        }
        return NEURO.client;
    }
}

export function getAPIv1(token: CompanionToken): APIv1 {
    return new APIv1Impl(token);
}

// Helper functions for internal use (these would be called by your main extension)
// export function getAllRegisteredActions(): RCEAction[] {
//     const actions: RCEAction[] = [];

//     for (const registration of COMPANIONS.values()) {
//         actions.push(...registration.actions.values());
//     }

//     return actions;
// }

// export function getActionByName(name: string): RCEAction | undefined {
//     for (const registration of registeredExtensions.values()) {
//         const action = registration.actions.get(name);
//         if (action) return action;
//     }
//     return undefined;
// }

// export function triggerActionRegistrationCallbacks(): void {
//     for (const registration of registeredExtensions.values()) {
//         for (const callback of registration.onRegistrationCallbacks) {
//             try {
//                 callback();
//             } catch (erm) {
//                 logOutput('ERROR', `Error in action registration callback for ${registration.displayName}: ${erm}`);
//             }
//         }
//     }
// }

// export function triggerActionUnregistrationCallbacks(): void {
//     for (const registration of registeredExtensions.values()) {
//         for (const callback of registration.onUnregistrationCallbacks) {
//             try {
//                 callback();
//             } catch (erm) {
//                 logOutput('ERROR', `Error in action unregistration callback for ${registration.displayName}: ${erm}`);
//             }
//         }
//     }
// }

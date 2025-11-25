import * as vscode from 'vscode';
import { logOutput, isPathNeuroSafe as _isPathNeuroSafe } from '../../utils';
import {
    ExtensionAPI,
    ConnectionStatus,
    CompanionExtension,
    RegistrationName,
    ExtensionRegisterReturns,
    ModifyMetadata,
} from '@vsc-neuropilot/api-types/api';
import { NeuroMessage } from '@vsc-neuropilot/api-types/messages';
import { APIv1 } from '~/packages/api-types/api/v1';
import { RCEAction, RCECancelEvent, RCECancelEventInitializer } from '@vsc-neuropilot/api-types';
import { CompanionToken } from '..';

// Internal storage for registered extensions
interface ExtensionRegistration {
    id: string;
    info: CompanionExtension;
    actionPrefix: string;
    token: string;
    displayName: string;
    actions: Map<string, RCEAction>;
    onRegistrationCallbacks: (() => RCEAction[])[];
    onUnregistrationCallbacks: (() => string[])[];
}

// Extension registry
const registeredExtensions = new Map<string, ExtensionRegistration>();
const tokenToExtension = new Map<string, string>();

// Event emitters
const connectionStatusEmitter = new vscode.EventEmitter<ConnectionStatus>();
const messageReceivedEmitter = new vscode.EventEmitter<NeuroMessage>();

// Utility functions
function generateToken(): string {
    return `ext_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

function validateToken(token: string): ExtensionRegistration {
    const extensionId = tokenToExtension.get(token);
    if (!extensionId) {
        throw new Error('Invalid or expired token');
    }

    const registration = registeredExtensions.get(extensionId);
    if (!registration) {
        throw new Error('Extension not found');
    }

    return registration;
}

function generateActionPrefix(nameOnActions: string): string {
    // Ensure the prefix is unique
    const prefix = nameOnActions.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let counter = 1;
    let finalPrefix = prefix;

    while ([...registeredExtensions.values()].some(ext => ext.actionPrefix === finalPrefix)) {
        finalPrefix = `${prefix}_${counter}`;
        counter++;
    }

    return finalPrefix;
}

export class APIv1Impl implements APIv1 {
    version = 1 as const;
    constructor(private _token: CompanionToken) {
        this._token = _token;
    }
    deactivatedExtension(message?: string): void {
        throw new Error('Method not implemented.');
    }
    modifyExtensionMeta(data: ModifyMetadata): ModifyMetadata {
        throw new Error('Method not implemented.');
    }
    addActions(actions: RCEAction[]): void {
        throw new Error('Method not implemented.');
    }
    removeActions(...names: string[]): void {
        throw new Error('Method not implemented.');
    }
    registerAction(actionName: string): void {
        throw new Error('Method not implemented.');
    }
    unregisterAction(actionName: string): void {
        throw new Error('Method not implemented.');
    }
    unregisterAllActions(): void {
        throw new Error('Method not implemented.');
    }
    reregisterAllActions(): void {
        throw new Error('Method not implemented.');
    }
    isPathNeuroSafe(...paths: string[]): boolean {
        throw new Error('Method not implemented.');
    }
    getVirtualCursor(): vscode.Position | null | undefined {
        throw new Error('Method not implemented.');
    }
    setVirtualCursor(location: vscode.Position | null): vscode.Position | null | undefined {
        throw new Error('Method not implemented.');
    }
    createCancelEvent<T = unknown>(init: RCECancelEventInitializer<T>): RCECancelEvent<T> {
        throw new Error('Method not implemented.');
    }
    sendPassiveContext(context: string, silent?: boolean): void {
        throw new Error('Method not implemented.');
    }
    sendResult(message?: string, success?: boolean): void {
        throw new Error('Method not implemented.');
    }
    forceNeuroAction(query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void {
        throw new Error('Method not implemented.');
    }
    getConnectionStatus(): ConnectionStatus {
        throw new Error('Method not implemented.');
    }
}

export function getAPIv1(token: CompanionToken): APIv1 {
    return new APIv1Impl(token);
}

// Helper functions for internal use (these would be called by your main extension)
export function getAllRegisteredActions(): RCEAction[] {
    const actions: RCEAction[] = [];

    for (const registration of registeredExtensions.values()) {
        actions.push(...registration.actions.values());
    }

    return actions;
}

export function getActionByName(name: string): RCEAction | undefined {
    for (const registration of registeredExtensions.values()) {
        const action = registration.actions.get(name);
        if (action) return action;
    }
    return undefined;
}

export function triggerActionRegistrationCallbacks(): void {
    for (const registration of registeredExtensions.values()) {
        for (const callback of registration.onRegistrationCallbacks) {
            try {
                callback();
            } catch (erm) {
                logOutput('ERROR', `Error in action registration callback for ${registration.displayName}: ${erm}`);
            }
        }
    }
}

export function triggerActionUnregistrationCallbacks(): void {
    for (const registration of registeredExtensions.values()) {
        for (const callback of registration.onUnregistrationCallbacks) {
            try {
                callback();
            } catch (erm) {
                logOutput('ERROR', `Error in action unregistration callback for ${registration.displayName}: ${erm}`);
            }
        }
    }
}

import * as vscode from 'vscode';
import { RCEAction } from '../../neuro_client_helper';
import { logOutput, isPathNeuroSafe as _isPathNeuroSafe } from '../../utils';
import {
    ExtensionAPI,
    ConnectionStatus,
    ExtensionInfo,
    RegistrationName,
    ExtensionRegisterReturns,
    ModifyMetadata,
} from '@vsc-neuropilot/api-types/api';
import { NeuroMessage } from '@vsc-neuropilot/api-types/messages';

// Internal storage for registered extensions
interface ExtensionRegistration {
    id: string;
    info: ExtensionInfo;
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

export function getAPIv1() {
    return {
        version: 1,

        // Helper functions
        isPathNeuroSafe(...paths: string[]) {
            return paths.every((p: string) => _isPathNeuroSafe(p));
        },
    };
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

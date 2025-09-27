import * as vscode from 'vscode';
import { ExtensionAPI } from '../neuropilot-types';
import { RCEAction } from '../../neuro_client_helper';
import { logOutput } from '../../utils';
import {
    ConnectionStatus,
    NeuroMessage,
    ExtensionInfo,
    RegistrationName,
    ExtensionRegisterReturns,
    ModifyMetadata,
} from '../neuropilot-types';

export interface APIv1 extends ExtensionAPI {
    version: 1;

    // Extension registration
    registerExtension(name: RegistrationName, info?: ExtensionInfo): ExtensionRegisterReturns;
    deactivatedExtension(token: string, message?: string): void;
    modifyExtensionMeta(token: string, data: ModifyMetadata): ModifyMetadata;

    // Action management
    addAction(token: string, name: string, action: RCEAction): void;
    removeAction(token: string, ...names: string[]): void;
    onActionRegistration(token: string, callback: () => RCEAction[]): vscode.Disposable;
    onActionUnregistration(token: string, callback: () => string[]): vscode.Disposable;

    // Utility functions
    isPathNeuroSafe(...paths: string[]): boolean;
    getVirtualCursor(): vscode.Position | null | undefined;
    setVirtualCursor(token: string, location: vscode.Position | null): vscode.Position | null | undefined;

    // Context and messaging
    sendPassiveContext(token: string, context: string, silent?: boolean): void;
    sendResult(token: string, message?: string, success?: boolean): void;
    forceNeuroAction(token: string, query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void;

    // Connection status
    getConnectionStatus(): ConnectionStatus;

    // Events (placeholder for future implementation)
    // TODO: Event system will be implemented here

    // Event exposure for connection changes
    onConnectionChanged: vscode.Event<ConnectionStatus>;
    onMessageReceived: vscode.Event<NeuroMessage>;
}

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

export function getAPIv1(): APIv1 {
    return {
        version: 1,

        // Extension registration
        registerExtension(name: RegistrationName, info?: ExtensionInfo): ExtensionRegisterReturns {
            // Validate input
            if (!name.display || !name.id || !name.nameOnActions) {
                throw new Error('Registration name must include display, id, and nameOnActions properties');
            }

            // Check if extension is already registered
            if (registeredExtensions.has(name.id)) {
                throw new Error(`Extension ${name.id} is already registered`);
            }

            // Generate unique action prefix and token
            const actionPrefix = generateActionPrefix(name.nameOnActions);
            const token = generateToken();

            // Create registration
            const registration: ExtensionRegistration = {
                id: name.id,
                info: info || {},
                actionPrefix,
                token,
                displayName: name.display,
                actions: new Map(),
                onRegistrationCallbacks: [],
                onUnregistrationCallbacks: [],
            };

            // Store registration
            registeredExtensions.set(name.id, registration);
            tokenToExtension.set(token, name.id);

            logOutput('INFO', `Extension registered: ${name.display} (${name.id})`);

            return {
                id: name.id,
                actionPrefix,
                token,
            };
        },

        deactivatedExtension(token: string, message?: string): void {
            const registration = validateToken(token);

            // Remove all actions
            registration.actions.clear();

            // Clean up storage
            registeredExtensions.delete(registration.id);
            tokenToExtension.delete(token);

            logOutput('INFO', `Extension deactivated: ${registration.displayName}${message ? ` - ${message}` : ''}`);
        },

        modifyExtensionMeta(token: string, data: ModifyMetadata): ModifyMetadata {
            const registration = validateToken(token);

            if (data.displayName) {
                registration.displayName = data.displayName;
            }

            if (data.nameOnActions) {
                // Warning: This requires action re-registration
                logOutput('WARNING', 'Changing nameOnActions requires manual action re-registration');
                registration.actionPrefix = generateActionPrefix(data.nameOnActions);
            }

            if (data.docsURL && registration.info) {
                // Update docs URL in registration info
                if (!registration.info.docs) {
                    registration.info.docs = { base: data.docsURL };
                } else {
                    registration.info.docs.base = data.docsURL;
                }
            }

            return data;
        },

        // Action management
        addAction(token: string, name: string, action: RCEAction): void {
            const registration = validateToken(token);

            // Validate action name format
            if (!/^[a-z0-9_]+$/.test(name)) {
                throw new Error('Action name must contain only lowercase letters, numbers, and underscores');
            }

            // Check if action already exists
            const fullActionName = `${registration.actionPrefix}.${name}`;
            if (registration.actions.has(fullActionName)) {
                throw new Error(`Action ${fullActionName} is already registered`);
            }

            // Store action with prefixed name
            registration.actions.set(fullActionName, { ...action, name: fullActionName });

            logOutput('INFO', `Action added: ${fullActionName} by ${registration.displayName}`);
        },

        removeAction(token: string, ...names: string[]): void {
            const registration = validateToken(token);

            for (const name of names) {
                const fullActionName = name.startsWith(registration.actionPrefix)
                    ? name
                    : `${registration.actionPrefix}.${name}`;

                if (registration.actions.has(fullActionName)) {
                    registration.actions.delete(fullActionName);
                    logOutput('INFO', `Action removed: ${fullActionName} by ${registration.displayName}`);
                } else {
                    logOutput('WARNING', `Attempted to remove non-existent action: ${fullActionName}`);
                }
            }
        },

        onActionRegistration(token: string, callback: () => RCEAction[]): vscode.Disposable {
            const registration = validateToken(token);

            registration.onRegistrationCallbacks.push(callback);

            // Call immediately if connected to API
            // TODO: Check if connected to Neuro API and call callback

            return new vscode.Disposable(() => {
                const index = registration.onRegistrationCallbacks.indexOf(callback);
                if (index > -1) {
                    registration.onRegistrationCallbacks.splice(index, 1);
                }
            });
        },

        onActionUnregistration(token: string, callback: () => string[]): vscode.Disposable {
            const registration = validateToken(token);

            registration.onUnregistrationCallbacks.push(callback);

            return new vscode.Disposable(() => {
                const index = registration.onUnregistrationCallbacks.indexOf(callback);
                if (index > -1) {
                    registration.onUnregistrationCallbacks.splice(index, 1);
                }
            });
        },

        // Utility functions
        isPathNeuroSafe(...paths: string[]): boolean {
            // TODO: Implement using your actual isPathNeuroSafe function
            return paths.every(path => {
                // Placeholder implementation
                const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspacePath) return false;

                const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
                const normalizedWorkspace = workspacePath.replace(/\\/g, '/').toLowerCase();

                return normalizedPath.startsWith(normalizedWorkspace) &&
                       !normalizedPath.includes('/.') &&
                       !normalizedPath.includes('node_modules');
            });
        },

        getVirtualCursor(): vscode.Position | null | undefined {
            // TODO: Implement using your actual getVirtualCursor function
            const editor = vscode.window.activeTextEditor;
            return editor ? editor.selection.active : undefined;
        },

        setVirtualCursor(token: string, location: vscode.Position | null): vscode.Position | null | undefined {
            validateToken(token); // Ensure valid token

            // TODO: Implement using your actual setVirtualCursor function
            const editor = vscode.window.activeTextEditor;
            if (!editor || !location) return null;

            editor.selection = new vscode.Selection(location, location);
            return location;
        },

        // Context and messaging
        sendPassiveContext(token: string, context: string, silent?: boolean): void {
            validateToken(token); // Ensure valid token

            // TODO: Implement using your actual sendPassiveContext function
            logOutput('INFO', `Passive context sent: ${context.substring(0, 50)}...`);
        },

        sendResult(token: string, message?: string, success?: boolean): void {
            validateToken(token); // Ensure valid token

            // TODO: Implement using your actual sendResult function
            logOutput('INFO', `Result sent: ${success ? 'SUCCESS' : 'FAILURE'} - ${message || 'No message'}`);
        },

        forceNeuroAction(token: string, query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void {
            validateToken(token); // Ensure valid token

            // TODO: Implement using your actual forceNeuroAction function
            logOutput('INFO', `Force action requested: ${query} with actions: ${action_names.join(', ')}`);
        },

        // Connection status
        getConnectionStatus(): ConnectionStatus {
            // TODO: Return actual connection status from your global state
            return {
                connected: false, // Replace with NEURO.connected
                url: null, // Replace with NEURO.url
            };
        },

        // Event exposure
        onConnectionChanged: connectionStatusEmitter.event,
        onMessageReceived: messageReceivedEmitter.event,

        // TODO: Event system placeholder
        // Events will be implemented here in the future
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

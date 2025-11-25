import { ExtensionAPI, RegistrationName, CompanionExtension, ExtensionRegisterReturns, ModifyMetadata, ConnectionStatus } from '.';
import * as vscode from 'vscode';
import { RCEAction } from '../utils/client_helpers';
import { NeuroMessage } from '../messages/incoming';

export interface APIv1 extends ExtensionAPI {
    version: 1;

    // Extension registration
    deactivatedExtension(message?: string): void;
    modifyExtensionMeta(data: ModifyMetadata): ModifyMetadata;

    // Action management
    addActions(actions: RCEAction[]): void;
    removeActions(...names: string[]): void;
    registerAction(actionName: string): void;
    unregisterAction(actionName: string): void;
    unregisterAllActions(): void;
    reregisterAllActions(): void;
    // onActionRegistration(callback: () => RCEAction[]): vscode.Disposable;
    // onActionUnregistration(callback: () => string[]): vscode.Disposable;

    // Utility functions
    isPathNeuroSafe(...paths: string[]): boolean;
    getVirtualCursor(): vscode.Position | null | undefined;
    setVirtualCursor(location: vscode.Position | null): vscode.Position | null | undefined;

    // Context and messaging
    sendPassiveContext(context: string, silent?: boolean): void;
    sendResult(message?: string, success?: boolean): void;
    forceNeuroAction(query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void;

    // Connection status
    getConnectionStatus(): ConnectionStatus;

    // Events (placeholder for future implementation)
    // TODO: Event system will be implemented here
}

/**
 * Implement this interface to create a companion extension for NeuroPilot v1 extensions.
 */
export interface CompanionExtensionV1 extends CompanionExtension {
    version: 1;
    onConnectionChanged(status: ConnectionStatus): void;
    onMessageReceived(message: NeuroMessage): void;
}

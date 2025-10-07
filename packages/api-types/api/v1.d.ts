import { ExtensionAPI, RegistrationName, ExtensionInfo, ExtensionRegisterReturns, ModifyMetadata, ConnectionStatus } from '.';
import * as vscode from 'vscode';
import { RCEAction } from '../utils/client_helpers';
import { NeuroMessage } from '../messages/incoming';

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

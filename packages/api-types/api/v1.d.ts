import { ExtensionAPI, CompanionExtension, ConnectionStatus } from '.';
import type * as vscode from 'vscode';
import { RCEAction } from '../utils/client_helpers';
import { NeuroMessage } from '../messages/incoming';
import { CursorPositionContextStyle, NeuroPositionContext, NeuroPositionContextOptions, RCECancelEvent, RCECancelEventInitializer } from '../utils';
import { NeuroClient } from 'neuro-game-sdk';

export interface APIv1 extends ExtensionAPI {
    version: 1;

    //#region Extension registration

    /**
     * Deactivate the companion extension.
     * Removes and unregisters all actions registered by this extension.
     * After deactivation, the API methods will no longer work.
     * @param message The message to display on deactivation.
     */
    deactivateExtension(message?: string): void;
    // modifyExtensionMeta(data: ModifyMetadata): ModifyMetadata;

    //#endregion

    //#region Action management

    /**
     * Add actions to the action registry.
     * @param actions The actions to add to the registry.
     */
    addActions(actions: RCEAction[]): void;
    /**
     * Remove actions from the action registry by their names.
     * Only actions added by this extension can be removed this way.
     * @param actionNames The names of the actions to remove from the registry.
     */
    removeActions(actionNames: string[]): void;
    /**
     * Register actions in the action registry with the Neuro API.
     * Only actions added by this extension can be registered this way.
     * @param actionNames The names of the actions to register.
     */
    registerActions(actionNames: string[]): void;
    /**
     * Unregister actions in the action registry from the Neuro API.
     * Only actions added by this extension can be unregistered this way.
     * @param actionNames The names of the actions to unregister.
     */
    unregisterActions(actionNames: string[]): void;
    /**
     * Unregister all actions added by this extension from the Neuro API.
     */
    unregisterAllActions(): void;
    /**
     * Reregister all actions as necessary, re-checking registration conditions.
     */
    reregisterAllActions(): void;
    /**
     * Get all actions added by this extension.
     */
    getActions(): RCEAction[];
    /**
     * Checks if the action with the given name is registered with the Neuro API.
     * @param actionName The action to check.
     * @returns `true` if the action is registered, `false` if the action is not registered, is registered by a different extension, or does not exist.
     */
    isActionRegistered(actionName: string): boolean;
    // onActionRegistration(callback: () => RCEAction[]): vscode.Disposable;
    // onActionUnregistration(callback: () => string[]): vscode.Disposable;

    //#endregion

    //#region Utility functions

    /**
     * Checks whether the given path is Neuro-safe.
     * @param path The path to check for Neuro-safety.
     * @see {@link https://vsc-neuropilot.github.io/docs/client/reference/safety/#file-access-restrictions}
     */
    isPathNeuroSafe(path: string): boolean;
    /**
     * Gets the position of the virtual cursor in the current text editor.
     * @returns The position of the virtual cursor in the current text editor,
     * or `null` if the text editor is not {@link https://vsc-neuropilot.github.io/docs/client/reference/safety/#file-access-restrictions Neuro-safe},
     * or `undefined` if the text editor does not exist or has no virtual cursor.
     */
    getVirtualCursor(): vscode.Position | null | undefined;
    /**
     * Places the virtual cursor at the specified position in the current text editor.
     * @param position The position to place the virtual cursor.
     */
    setVirtualCursor(position: vscode.Position): void;

    //#endregion

    //#region Factory functions

    /**
     * Creates a cancellation event for use with RCE actions.
     * @param init The initializer for the {@link RCECancelEvent}.
     */
    createCancelEvent<T = unknown>(init: RCECancelEventInitializer<T>): RCECancelEvent<T>;

    // Context and messaging
    /**
     * Send context to Neuro.
     * @param context The context to send to Neuro.
     * @param silent Whether the context is {@link https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md#parameters-2 silent}.
     */
    sendContext(context: string, silent?: boolean): void;
    // sendResult(message?: string, success?: boolean): void;
    // forceNeuroActions(query: string, action_names: string[], state?: string, ephemeral_context?: boolean): void;
    /**
     * Gets the context around a specified range in a document.
     * If no range is specified, gets the entire document.
     * Do not use the result of this for position calculations, as the file is filtered to remove Windows-style line endings.
     * @param document The document to get the context from.
     * @param options The options for getting the context. If passed a {@link vscode.Position}, it is used as `cursorPosition`, `position` and `position2`.
     * @returns The context around the specified range. The amount of lines before and after the range is configurable in the settings.
     */
    getPositionContext(document: vscode.TextDocument, options: NeuroPositionContextOptions | vscode.Position): NeuroPositionContext;
    /**
     * Formats the context for sending to Neuro.
     * Assumes the cursor is at the end of `contextBefore` + `contextBetween` and at the start of `contextAfter`.
     * @param context The context to format.
     * @param overrideCursorStyle If provided, overrides the cursor style setting for this context.
     * @returns The formatted context.
     */
    formatContext(context: NeuroPositionContext, overrideCursorStyle?: CursorPositionContextStyle): string;

    //#endregion

    //#region Client

    /**
     * Gets the current connection status with the Neuro API.
     */
    getConnectionStatus(): ConnectionStatus;

    /**
     * Gets the Neuro client instance directly.
     * Prefer using the higher-level API methods where possible.
     * @returns The Neuro client instance, or `null` if not connected.
     */
    getNeuroClient(): NeuroClient | null;

    //#endregion

    // Events (placeholder for future implementation)
    // TODO: Event system will be implemented here
}

// TODO: Call the callbacks somewhere
/**
 * Implement this interface to create a companion extension for NeuroPilot v1 extensions.
 */
export interface CompanionExtensionV1 extends CompanionExtension {
    version: 1;
    onConnectionChanged?(status: ConnectionStatus): void;
    onMessageReceived?(message: NeuroMessage): void;
}

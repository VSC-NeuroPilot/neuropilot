import * as vscode from 'vscode';
import { createClient, isPathNeuroSafe, setVirtualCursor } from '../utils';
import { NEURO } from '../constants';
import {
    initializeCommonState,
    setupCommonProviders,
    registerCommonCommands,
    setupCommonEventHandlers,
    setupClientConnectedHandlers,
    createStatusBarItem,
    deactivate as commonDeactivate,
    obtainExtensionState,
    getDecorationRenderOptions,
    reloadPermissions,
} from '../shared/extension';
import { registerDocsLink } from '../shared/docs';
import { registerUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';

export { registerDocsLink };

export function activate(context: vscode.ExtensionContext) {
    // Initialize common state
    initializeCommonState(context);

    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadWebPermissions);

    // Setup providers
    NEURO.context!.subscriptions.push(...setupCommonProviders());

    // Register commands
    NEURO.context!.subscriptions.push(...registerCommonCommands());

    // Setup event handlers
    NEURO.context!.subscriptions.push(...setupCommonEventHandlers());

    // Setup client connected handlers
    setupClientConnectedHandlers(registerUnsupervisedActions, registerUnsupervisedHandlers);

    // Create status bar item
    createStatusBarItem();

    // Extension state
    obtainExtensionState();

    // Create client
    createClient();

    // Create cursor decoration (web-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getDecorationRenderOptions());

    // Set initial virtual cursor
    if (vscode.window.activeTextEditor && isPathNeuroSafe(vscode.window.activeTextEditor.document.fileName)) {
        setVirtualCursor(vscode.window.activeTextEditor.selection.active);
    }
}

export function deactivate() {
    commonDeactivate();
}

function reloadWebPermissions() {
    reloadPermissions(registerUnsupervisedActions);
}

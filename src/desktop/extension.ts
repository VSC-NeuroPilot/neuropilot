import * as vscode from 'vscode';
import { reloadTasks, taskEndedHandler } from '../tasks';
import { emergencyTerminalShutdown, saveContextForTerminal } from '../pseudoterminal';
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
    registerDocsLink,
    getDecorationRenderOptions,
    obtainExtensionState,
    reloadPermissions,
} from '../shared/extension-common';
import { registerChatParticipant } from '../chat';
import { registerUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';

export { registerDocsLink };

export function activate(context: vscode.ExtensionContext) {
    // Initialize common state
    initializeCommonState();

    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadDesktopPermissions);

    // Setup providers
    context.subscriptions.push(...setupCommonProviders());

    // Register commands
    context.subscriptions.push(...registerCommonCommands());

    // Setup event handlers
    context.subscriptions.push(...setupCommonEventHandlers());

    // Desktop-specific handlers
    context.subscriptions.push(vscode.tasks.onDidEndTask(taskEndedHandler));

    // Chat participant (desktop-specific setup)
    registerChatParticipant(context);
    saveContextForTerminal(context);

    // Setup client connected handlers
    setupClientConnectedHandlers(reloadTasks, registerUnsupervisedActions, registerUnsupervisedHandlers); // reloadTasks added to set it up at the same time

    // Create status bar item
    createStatusBarItem(context);

    // Extension state
    obtainExtensionState();

    // Create client
    createClient();

    // Create cursor decoration (desktop-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getDecorationRenderOptions(context));

    // Set initial virtual cursor
    if (vscode.window.activeTextEditor && isPathNeuroSafe(vscode.window.activeTextEditor.document.fileName)) {
        setVirtualCursor(vscode.window.activeTextEditor.selection.active);
    }
}

export function deactivate() {
    emergencyTerminalShutdown();
    commonDeactivate();
}

function reloadDesktopPermissions() {
    reloadPermissions(reloadTasks, registerUnsupervisedActions);
}

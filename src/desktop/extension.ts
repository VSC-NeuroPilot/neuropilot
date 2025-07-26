import * as vscode from 'vscode';
import { reloadTasks, taskEndedHandler } from '../tasks';
import { emergencyTerminalShutdown } from '../pseudoterminal';
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
    getDecorationRenderOptions,
    obtainExtensionState,
    reloadPermissions,
} from '../shared/extension';
import { registerDocsLink } from '../shared/docs';
import { registerChatParticipant } from '../chat';
import { registerUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';

export { registerDocsLink };

export function activate(context: vscode.ExtensionContext) {

    // Initialize common state
    initializeCommonState(context);

    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadDesktopPermissions);

    // Setup providers
    NEURO.context!.subscriptions.push(...setupCommonProviders());

    // Register commands
    NEURO.context!.subscriptions.push(...registerCommonCommands());

    // Setup event handlers
    NEURO.context!.subscriptions.push(...setupCommonEventHandlers());

    // Desktop-specific handlers
    NEURO.context!.subscriptions.push(vscode.tasks.onDidEndTask(taskEndedHandler));

    // Chat participant (desktop-specific setup)
    registerChatParticipant();

    // Setup client connected handlers
    setupClientConnectedHandlers(reloadTasks, registerUnsupervisedActions, registerUnsupervisedHandlers); // reloadTasks added to set it up at the same time

    // Create status bar item
    createStatusBarItem();

    // Extension state
    obtainExtensionState();

    // Create client
    createClient();

    // Create cursor decoration (desktop-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getDecorationRenderOptions());

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

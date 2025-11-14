import * as vscode from 'vscode';
import { handleTerminateTask, reloadTasks, taskEndedHandler } from '@/tasks';
import { emergencyTerminalShutdown } from '@/pseudoterminal';
import { isPathNeuroSafe, setVirtualCursor, normalizePath, getWorkspacePath } from '@/utils';
import { NEURO } from '@/constants';
import {
    initializeCommonState,
    setupCommonProviders,
    registerCommonCommands,
    setupCommonEventHandlers,
    setupClientConnectedHandlers,
    createStatusBarItem,
    deactivate as commonDeactivate,
    getCursorDecorationRenderOptions,
    getDiffAddedDecorationRenderOptions,
    getDiffRemovedDecorationRenderOptions,
    getDiffModifiedDecorationRenderOptions,
    obtainExtensionState,
    reloadPermissions,
    getHighlightDecorationRenderOptions,
    showUpdateReminder,
    startupCreateClient,
} from '@shared/extension';
import { registerChatParticipant } from '@/chat';
import { addUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';
import { registerSendSelectionToNeuro } from '@/editing';
import { loadIgnoreFiles } from '@/ignore_files_utils';
import { reregisterAllActions } from '../rce';

export function activate(context: vscode.ExtensionContext) {
    loadIgnoreFiles(
        normalizePath(
            getWorkspacePath() || '',
        ) || '',
    );

    // Initialize common state
    initializeCommonState(context);

    // Show update reminder if version changed
    showUpdateReminder(context);

    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadDesktopPermissions);

    // Add actions to the registry
    addUnsupervisedActions();

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
    setupClientConnectedHandlers(reloadTasks, () => reregisterAllActions(false), registerUnsupervisedHandlers); // reloadTasks added to set it up at the same time

    // Create status bar item
    createStatusBarItem();

    // Extension state (delaying this by 5000ms so that the git extension has some time to activate)
    setTimeout(obtainExtensionState, 5000);

    // Create client
    startupCreateClient();

    // Create cursor decoration (desktop-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getCursorDecorationRenderOptions());
    NEURO.diffAddedDecorationType = vscode.window.createTextEditorDecorationType(getDiffAddedDecorationRenderOptions());
    NEURO.diffRemovedDecorationType = vscode.window.createTextEditorDecorationType(getDiffRemovedDecorationRenderOptions());
    NEURO.diffModifiedDecorationType = vscode.window.createTextEditorDecorationType(getDiffModifiedDecorationRenderOptions());
    NEURO.highlightDecorationType = vscode.window.createTextEditorDecorationType(getHighlightDecorationRenderOptions());

    // Set initial virtual cursor
    if (vscode.window.activeTextEditor && isPathNeuroSafe(vscode.window.activeTextEditor.document.fileName)) {
        setVirtualCursor(vscode.window.activeTextEditor.selection.active);
    }

    // The "Send selection to Neuro" feature requires both a command and a code action provider.
    // To keep related logic together and allow easy registration in both desktop and web, it is encapsulated
    // in registerSendSelectionToNeuro instead of being registered inline like most single commands.
    registerSendSelectionToNeuro(context);
}

export function deactivate() {
    emergencyTerminalShutdown();
    handleTerminateTask({
        id: 'none',
        name: 'terminate_task',
    });
    commonDeactivate();
}

function reloadDesktopPermissions() {
    reloadPermissions(reloadTasks, () => reregisterAllActions(false));
}

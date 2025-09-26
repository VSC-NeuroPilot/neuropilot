import * as vscode from 'vscode';
import { NEURO, EXTENSIONS } from '@/constants';
import { logOutput, createClient, onClientConnected, setVirtualCursor } from '@/utils';
import { completionsProvider, registerCompletionResultHandler } from '@/completions';
import { giveCookie, registerRequestCookieAction, registerRequestCookieHandler, sendCurrentFile } from '@/context';
import { registerChatResponseHandler } from '@/chat';
import { ACCESS, CONFIG } from '@/config';
import { explainWithNeuro, fixWithNeuro, NeuroCodeActionsProvider, sendDiagnosticsDiff } from '@/lint_problems';
import { editorChangeHandler, fileSaveListener, moveNeuroCursorHere, toggleSaveAction, workspaceEditHandler } from '@/editing';
import { emergencyDenyRequests, acceptRceRequest, denyRceRequest, revealRceNotification } from '@/rce';
import type { GitExtension } from '@typing/git';
import { getGitExtension } from '@/git';
import { registerDocsCommands, registerDocsLink } from './docs';

// Shared commands
export function registerCommonCommands() {
    return [
        vscode.commands.registerCommand('neuropilot.reconnect', reconnect),
        vscode.commands.registerCommand('neuropilot.moveNeuroCursorHere', moveNeuroCursorHere),
        vscode.commands.registerCommand('neuropilot.sendCurrentFile', sendCurrentFile),
        vscode.commands.registerCommand('neuropilot.giveCookie', giveCookie),
        vscode.commands.registerCommand('neuropilot.disableAllPermissions', disableAllPermissions),
        vscode.commands.registerCommand('neuropilot.acceptRceRequest', acceptRceRequest),
        vscode.commands.registerCommand('neuropilot.denyRceRequest', denyRceRequest),
        vscode.commands.registerCommand('neuropilot.revealRceNotification', revealRceNotification),
        vscode.commands.registerCommand('neuropilot.fixWithNeuro', fixWithNeuro),
        vscode.commands.registerCommand('neuropilot.explainWithNeuro', explainWithNeuro),
        vscode.commands.registerCommand('neuropilot.switchNeuroAPIUser', switchCurrentNeuroAPIUser),
        vscode.commands.registerCommand('neuropilot.refreshExtensionDependencyState', obtainExtensionState),
        ...registerDocsCommands(),
    ];
}

export function setupCommonEventHandlers() {
    const handlers = [
        vscode.languages.onDidChangeDiagnostics(sendDiagnosticsDiff),
        vscode.workspace.onDidSaveTextDocument(fileSaveListener),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('files.autoSave')) {
                NEURO.client?.sendContext('The Auto-Save setting has been modified.');
                toggleSaveAction();
            }
            if (event.affectsConfiguration('neuropilot.docsURL')) {
                logOutput('INFO', 'NeuroPilot Docs URL changed.');
                registerDocsLink('NeuroPilot', CONFIG.docsURL);
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('neuropilot.currentlyAsNeuroAPI')) {
                NEURO.currentController = CONFIG.currentlyAsNeuroAPI;
                logOutput('DEBUG', `Changed current controller name to ${NEURO.currentController}.`);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(editorChangeHandler),
        vscode.workspace.onDidChangeTextDocument(workspaceEditHandler),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('neuropilot.hideCopilotRequests')) {
                if (CONFIG.hideCopilotRequests) {
                    NEURO.statusBarItem?.show();
                } else {
                    NEURO.statusBarItem?.hide();
                }
            }
            if (
                event.affectsConfiguration('neuropilot.access.dotFiles')
                || event.affectsConfiguration('neuropilot.access.externalFiles')
                || event.affectsConfiguration('neuropilot.access.includePattern')
                || event.affectsConfiguration('neuropilot.access.excludePattern')
                || event.affectsConfiguration('neuropilot.permission.editActiveDocument')
            ) {
                setVirtualCursor();
            }
            if (event.affectsConfiguration('neuropilot.permission') || event.affectsConfiguration('neuropilot.disabledActions')) {
                vscode.commands.executeCommand('neuropilot.reloadPermissions');
            }
        }),
        vscode.extensions.onDidChange(obtainExtensionState),
    ];

    return handlers;
}

export function initializeCommonState(context: vscode.ExtensionContext) {
    NEURO.context = context;
    NEURO.url = CONFIG.websocketUrl;
    NEURO.gameName = CONFIG.gameName;
    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.outputChannel = vscode.window.createOutputChannel('NeuroPilot');
    NEURO.currentController = CONFIG.currentlyAsNeuroAPI;
}

export function setupCommonProviders() {
    const providers = [
        vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, completionsProvider),
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            new NeuroCodeActionsProvider(),
            { providedCodeActionKinds: NeuroCodeActionsProvider.providedCodeActionKinds },
        ),
    ];

    return providers;
}

export function setupClientConnectedHandlers(...extraHandlers: (() => void)[]) {
    onClientConnected(registerPreActionHandler);
    onClientConnected(registerCompletionResultHandler);
    onClientConnected(registerChatResponseHandler);
    for (const handlers of extraHandlers) {
        onClientConnected(handlers);
    }
    onClientConnected(registerRequestCookieAction);
    onClientConnected(registerRequestCookieHandler);
    onClientConnected(registerPostActionHandler);
}

export function createStatusBarItem() {
    NEURO.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    NEURO.context!.subscriptions.push(NEURO.statusBarItem);
    NEURO.statusBarItem.name = 'NeuroPilot';
    NEURO.statusBarItem.command = 'neuropilot.revealRceNotification';
    NEURO.statusBarItem.text = '$(neuropilot-heart)';
    NEURO.statusBarItem.tooltip = new vscode.MarkdownString('No active request');
    NEURO.statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
    NEURO.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.background');

    if (CONFIG.hideCopilotRequests) {
        NEURO.statusBarItem.show();
    }
}

// Shared utility functions
function reconnect() {
    logOutput('INFO', 'Attempting to reconnect to Neuro API');
    createClient();
}

export function reloadPermissions(...extraFunctions: (() => void)[]) {
    registerRequestCookieAction();
    for (const reloads of extraFunctions) {
        reloads();
    }
}

function registerPreActionHandler() {
    NEURO.client?.onAction((_actionData) => {
        NEURO.actionHandled = false;
    });
}

function registerPostActionHandler() {
    NEURO.client?.onAction((actionData) => {
        if (NEURO.actionHandled) return;
        NEURO.client?.sendActionResult(actionData.id, true, 'Unknown action');
    });
}

function disableAllPermissions() {
    NEURO.killSwitch = true;
    const config = vscode.workspace.getConfiguration('neuropilot');
    const permissionKeys = config.get<Record<string, string>>('permission');
    const promises: Thenable<void>[] = [];

    if (permissionKeys) {
        // Yes this will spam Neuro but if Vedal has to use it she probably deserves it
        for (const key of Object.keys(permissionKeys)) {
            promises.push(config.update(`permission.${key}`, 'Off', vscode.ConfigurationTarget.Workspace));
        }
    }

    if (ACCESS.dotFiles === true) {
        promises.push(config.update('access.dotFiles', false, vscode.ConfigurationTarget.Workspace));
    }

    if (ACCESS.externalFiles) {
        promises.push(config.update('access.externalFiles', false, vscode.ConfigurationTarget.Workspace));
    }

    if (ACCESS.environmentVariables) {
        promises.push(config.update('access.environmentVariables', false, vscode.ConfigurationTarget.Workspace));
    }

    if (CONFIG.sendNewLintingProblemsOn !== 'off') {
        promises.push(config.update('sendNewLintingProblemsOn', 'off', vscode.ConfigurationTarget.Workspace));
    }

    const exe = NEURO.currentTaskExecution;
    if (exe) {
        exe.terminate();
        NEURO.currentTaskExecution = null;
    }
    emergencyDenyRequests();

    Promise.all(promises).then(() => {
        vscode.commands.executeCommand('neuropilot.reloadPermissions'); // Reload permissions to unregister all actions
        NEURO.client?.sendContext('Vedal has turned off all permissions.');
        vscode.window.showInformationMessage('All permissions, all unsafe path rules and linting auto-context have been turned off, all actions have been unregistered and any terminal shells have been killed.');
        NEURO.killSwitch = false;
    });
}

function switchCurrentNeuroAPIUser() {
    const quickPick = vscode.window.createQuickPick();
    quickPick.items = [
        { label: 'Neuro' },
        { label: 'Evil' },
        { label: 'Randy' },
        { label: 'Jippity' },
        { label: 'Tony' },
        { label: 'Gary' },
    ];
    quickPick.placeholder = 'Switch to who?';
    quickPick.activeItems = quickPick.items.filter(item => item.label === NEURO.currentController);
    quickPick.onDidAccept(() => {
        const selected = quickPick.activeItems[0].label ?? quickPick.value;
        if (!selected) {
            logOutput('ERROR', 'No selection was made.');
            quickPick.hide();
            return;
        }
        vscode.workspace.getConfiguration('neuropilot').update('currentlyAsNeuroAPI', selected, vscode.ConfigurationTarget.Global);
        quickPick.hide();
    });
    quickPick.show();
}

export function obtainExtensionState(): void {
    const copilotChat = vscode.extensions.getExtension('github.copilot-chat')?.isActive;
    EXTENSIONS.copilotChat = copilotChat === true;

    const git = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (git?.isActive !== undefined) {
        EXTENSIONS.git = git.isActive === true ? git.exports : null;
    } else {
        EXTENSIONS.git = null;
    }
    if (vscode.env.uiKind === vscode.UIKind.Desktop) {
        getGitExtension();
    }
}

export function deactivate() {
    NEURO.client?.sendContext(`NeuroPilot is being deactivated, or ${CONFIG.gameName} is closing. See you next time, ${NEURO.currentController}!`);
}

export function getCursorDecorationRenderOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        border: '1px solid rgba(0, 0, 0, 0)',
        borderRadius: '1px',
        overviewRulerColor: 'rgba(255, 85, 229, 0.5)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        gutterIconPath: vscode.Uri.joinPath(NEURO.context!.extensionUri, 'assets/heart.png'),
        gutterIconSize: 'contain',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        before: {
            contentText: 'ᛙ',
            margin: '0 0 0 -0.25ch',
            textDecoration: 'none; position: absolute; display: inline-block; top: 0; font-size: 200%; font-weight: bold, z-index: 1',
            color: 'rgba(255, 85, 229)',
        },
    };
}

export function getDiffAddedDecorationRenderOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(0, 255, 0, 0.25)',
        border: '1px solid rgba(255, 85, 229, 0.5)',
        borderRadius: '0px',
        overviewRulerColor: 'rgba(0, 255, 0, 0.5)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    };
}

export function getDiffRemovedDecorationRenderOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        border: '1px solid rgba(255, 0, 0, 0.5)',
        borderRadius: '0px',
        overviewRulerColor: 'rgba(255, 0, 0, 0.5)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        before: {
            contentText: '▲',
            margin: '0 0 0 -0.4ch',
            textDecoration: 'none; position: absolute; display: inline-block; top: 1.25ch; font-size: 75%, z-index: 1; -webkit-text-stroke: 1px rgba(255, 85, 229, 0.5)',
            color: 'rgba(255, 0, 0, 0.5)',
        },
    };
}

export function getDiffModifiedDecorationRenderOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(255, 255, 0, 0.25)',
        border: '1px solid rgba(255, 85, 229, 0.5)',
        borderRadius: '0px',
        overviewRulerColor: 'rgba(255, 255, 0, 0.5)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    };
}

export function getHighlightDecorationRenderOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(202, 22, 175, 1)',
        border: '2px solid rgba(255, 85, 229, 1)',
        borderRadius: '0px',
        overviewRulerColor: 'rgba(255, 85, 229, 1)',
        overviewRulerLane: vscode.OverviewRulerLane.Center,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    };
}

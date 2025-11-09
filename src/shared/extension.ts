import * as vscode from 'vscode';
import { NEURO, EXTENSIONS } from '@/constants';
import { logOutput, createClient, onClientConnected, setVirtualCursor, showAPIMessage, disconnectClient, reconnectClient, getWorkspaceUri } from '@/utils';
import { completionsProvider, registerCompletionResultHandler } from '@/completions';
import { giveCookie, registerRequestCookieAction, registerRequestCookieHandler, sendCurrentFile } from '@/context';
import { registerChatResponseHandler } from '@/chat';
import { ACCESS, ACTIONS, checkDeprecatedSettings, CONFIG, CONNECTION } from '@/config';
import { explainWithNeuro, fixWithNeuro, NeuroCodeActionsProvider, sendDiagnosticsDiff } from '@/lint_problems';
import { editorChangeHandler, fileSaveListener, moveNeuroCursorHere, toggleSaveAction, workspaceEditHandler } from '@/editing';
import { emergencyDenyRequests, acceptRceRequest, denyRceRequest, revealRceNotification, clearRceRequest } from '@/rce';
import type { GitExtension } from '@typing/git';
import { getGitExtension } from '@/git';
import { openDocsOnTarget, registerDocsCommands, registerDocsLink } from './docs';
import { readChangelogAndSendToNeuro } from '@/changelog';
import { moveCursorEmitterDiposable } from '@events/cursor';
import { loadIgnoreFiles } from '@/ignore_files_utils';
import { getWorkspacePath, normalizePath } from '@/utils';

// Shared commands
export function registerCommonCommands() {
    return [
        vscode.commands.registerCommand('neuropilot.reconnect', reconnect),
        vscode.commands.registerCommand('neuropilot.disconnect', disconnect),
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
        vscode.commands.registerCommand('neuropilot.resetTemporarilyDisabledActions', () => NEURO.tempDisabledActions = []),
        vscode.commands.registerCommand('neuropilot.readChangelog', readChangelogAndSendToNeuro),
        vscode.commands.registerCommand('neuropilot.dev.clearMementos', clearAllMementos),
        ...registerDocsCommands(),
    ];
}

export function setupCommonEventHandlers() {
    const handlers = [
        vscode.languages.onDidChangeDiagnostics(sendDiagnosticsDiff),
        vscode.workspace.onDidSaveTextDocument(async (e) => {
            fileSaveListener(e);
            const workspaceUri = getWorkspaceUri();
            if (workspaceUri) {
                const isIgnoreFile = ACCESS.ignoreFiles.some(f => vscode.Uri.joinPath(workspaceUri, f).fsPath === e.fileName);
                if (isIgnoreFile) await loadIgnoreFiles(getWorkspacePath() || '');
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(editorChangeHandler),
        vscode.workspace.onDidChangeTextDocument(workspaceEditHandler),
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('files.autoSave')) {
                NEURO.client?.sendContext('The Auto-Save setting has been modified.');
                toggleSaveAction();
            }
            if (event.affectsConfiguration('neuropilot.docsURL')) {
                logOutput('INFO', 'NeuroPilot Docs URL changed.');
                registerDocsLink('NeuroPilot', CONFIG.docsURL);
            }
            if (event.affectsConfiguration('neuropilot.connection.nameOfAPI')) {
                NEURO.currentController = CONNECTION.nameOfAPI;
                logOutput('DEBUG', `Changed current controller name to ${NEURO.currentController}.`);
            }
            if (event.affectsConfiguration('neuropilot.actions.hideCopilotRequests')) {
                if (ACTIONS.hideCopilotRequests) {
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
            if (event.affectsConfiguration('neuropilot.permission') || event.affectsConfiguration('neuropilot.actions.disabledActions')) {
                vscode.commands.executeCommand('neuropilot.reloadPermissions');
            }

            if (event.affectsConfiguration('neuropilot.access.ignoreFiles')) {
                await loadIgnoreFiles(
                    normalizePath(
                        getWorkspacePath() || '',
                    ) || '',
                );
            }
        }),
        vscode.extensions.onDidChange(obtainExtensionState),
        moveCursorEmitterDiposable,
    ];

    return handlers;
}

export function initializeCommonState(context: vscode.ExtensionContext) {
    NEURO.context = context;
    NEURO.url = CONNECTION.websocketUrl;
    NEURO.gameName = CONNECTION.gameName;
    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.outputChannel = vscode.window.createOutputChannel('NeuroPilot');
    NEURO.currentController = CONNECTION.nameOfAPI;
    NEURO.context.subscriptions.push(NEURO.outputChannel);
    checkDeprecatedSettings(context.extension.packageJSON.version as string);
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

    if (ACTIONS.hideCopilotRequests) {
        NEURO.statusBarItem.show();
    }
}

export function startupCreateClient() {
    if (CONNECTION.autoConnect) {
        createClient();
    } else {
        showAPIMessage('disabled');
    }
}

// Shared utility functions
function reconnect() {
    logOutput('INFO', 'Attempting to reconnect to Neuro API');
    reconnectClient();
}

function disconnect() {
    if (!NEURO.client) {
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }
    logOutput('INFO', 'Manually disconnecting from Neuro API');
    disconnectClient();
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
        NEURO.client?.sendContext(`${CONNECTION.userName} has turned off all permissions.`);
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
        vscode.workspace.getConfiguration('neuropilot').update('connection.nameOfAPI', selected, vscode.ConfigurationTarget.Global);
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
    NEURO.client?.sendContext(`NeuroPilot is being deactivated, or ${CONNECTION.gameName} is closing. See you next time, ${NEURO.currentController}!`);
    clearRceRequest();
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

/**
 * Shows a popup reminding the user to check the changelog and docs if the extension version has changed.
 * Only shows once per version update, using memento storage.
 * Does NOT show on brand new installs (sets memento to current version instead).
 */
export function showUpdateReminder(context: vscode.ExtensionContext) {
    const mementoKey = 'lastVersionReminder';
    const lastVersion = context.globalState.get<string>(mementoKey);
    const docsUrl = 'https://vsc-neuropilot.github.io/docs';
    const manifest = context.extension.packageJSON;
    const version = manifest.version as string;
    const id = context.extension.id;
    const askLabel = `Send ${CONNECTION.nameOfAPI} changelog`;
    const showPopup = (modal: boolean) => {
        if (!lastVersion) {
            vscode.window.showInformationMessage(
                `Welcome to NeuroPilot. You have just installed version ${version}.`,
                { modal },
                askLabel,
                'View Changelog',
                'View Docs',
                'Configure NeuroPilot',
            ).then(async selection => {
                if (selection === 'View Changelog') {
                    const changelogUri = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
                    await vscode.commands.executeCommand('markdown.showPreview', changelogUri);
                    // Re-show non-modally to avoid focus/sound
                    showPopup(false);
                } else if (selection === 'View Docs') {
                    await openDocsOnTarget('NeuroPilot', docsUrl);
                    showPopup(false);
                } else if (selection === 'Configure NeuroPilot') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${id}`);
                    showPopup(false);
                } else if (selection === askLabel) {
                    await vscode.commands.executeCommand('neuropilot.readChangelog');
                    showPopup(false);
                }
            });
            return;
        }

        if (lastVersion !== version) {
            vscode.window.showInformationMessage(
                `NeuroPilot updated to version ${version}. Please check the changelog and docs for important changes. You can also let ${CONNECTION.nameOfAPI} read the changes now or later from the Command Palette.`,
                { modal },
                askLabel,
                'View Changelog',
                'View Docs',
            ).then(async selection => {
                if (selection === 'View Changelog') {
                    // Open local CHANGELOG.md in markdown preview
                    const changelogUri = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
                    await vscode.commands.executeCommand('markdown.showPreview', changelogUri);
                    // Re-show non-modally to allow visiting both
                    showPopup(false);
                } else if (selection === 'View Docs') {
                    await openDocsOnTarget('NeuroPilot', docsUrl);
                    // Re-show non-modally to allow visiting both
                    showPopup(false);
                } else if (selection === askLabel) {
                    await vscode.commands.executeCommand('neuropilot.readChangelog');
                    showPopup(false);
                }
            });
        }
    };
    // Show as modal on first display; subsequent displays will be non-modal
    showPopup(true);
    context.globalState.update(mementoKey, version);
}

/**
 * Developer utility: clears all memento values stored by NeuroPilot for this profile.
 * This removes keys from both globalState and workspaceState.
 */
async function clearAllMementos(): Promise<void> {
    const context = NEURO.context;
    if (!context) {
        vscode.window.showErrorMessage('Extension context not initialized.');
        return;
    }

    const isDev = context.extensionMode === vscode.ExtensionMode.Development;
    if (!isDev) {
        vscode.window.showErrorMessage('This developer utility is only available in the Extension Development Host.');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Clear all NeuroPilot mementos (global and workspace)? This cannot be undone.',
        { modal: true },
        'Clear',
    );
    if (confirm !== 'Clear') return;

    const globalKeys = context.globalState.keys();
    const workspaceKeys = context.workspaceState.keys();

    const updates: Thenable<void>[] = [];
    for (const key of globalKeys) {
        updates.push(context.globalState.update(key, undefined));
    }
    for (const key of workspaceKeys) {
        updates.push(context.workspaceState.update(key, undefined));
    }
    await Promise.all(updates);

    vscode.window.showInformationMessage('NeuroPilot mementos cleared.');
}

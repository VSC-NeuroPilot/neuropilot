import * as vscode from 'vscode';
import { PermissionLevel } from '@vsc-neuropilot/api-types';

import { setPermissions } from '@/config';
import { BaseWebviewViewProvider } from './base';
import { getExtendedActionsInfo } from '@/rce';
import { toTitleCase } from '@vsc-neuropilot/api-types/utils';
import type { ActionsViewMessage, ActionsViewProviderMessage, SettingsContext, ActionNode } from '@typing/views/actions';

export class ActionsViewProvider extends BaseWebviewViewProvider<ActionsViewMessage, ActionsViewProviderMessage> {
    public static readonly viewId = 'neuropilot.actionsView';
    private _currentContext: SettingsContext = 'workspace';

    constructor() {
        super('actions/main.js', ['actions/style.css']);
    }

    protected onViewReady() { }

    public refreshActions() {
        const actionsInfo = getExtendedActionsInfo();
        const actionNodes = actionsInfo
            .filter(info => !(info.action.hidden ?? false))
            .map(info => ({
                id: info.action.name,
                label: info.action.displayName ?? toTitleCase(info.action.name),
                category: info.action.category ?? 'Unknown',
                description: info.action.description,
                permissionLevel:
                    (this._currentContext === 'user' ? info.configuredGlobalPermission : info.configuredWorkspacePermission)
                    ?? info.configuredGlobalPermission
                    ?? info.action.defaultPermission
                    ?? PermissionLevel.OFF,
                modifiedInCurrentContext:
                    this._currentContext === 'workspace' && info.configuredWorkspacePermission !== undefined
                    || this._currentContext === 'user' && info.configuredGlobalPermission !== undefined,
                modifiedExternally:
                    // We are in workspace context and the permission is modified in global settings but not in workspace settings
                    this._currentContext === 'workspace' && info.configuredWorkspacePermission === undefined && info.configuredGlobalPermission !== undefined
                    // OR we are in user context and the permission is modified in workspace settings
                    || this._currentContext === 'user' && info.configuredWorkspacePermission !== undefined
                    // OR the permission is not modified in either context and the default permission is different from OFF
                    || info.configuredWorkspacePermission === undefined && info.configuredGlobalPermission === undefined && (info.action.defaultPermission ?? PermissionLevel.OFF) !== PermissionLevel.OFF,
                isRegistered: info.isRegistered,
            } satisfies ActionNode));
        // TODO: Fix flickering by specifying if actions have been added/removed
        // Nevermind, it doesn't flicker anymore??
        this._view?.webview.postMessage({
            type: 'refreshActions',
            actions: actionNodes,
        });
    }

    protected handleMessage(message: ActionsViewMessage): void {
        switch (message.type) {
            case 'viewToggledPermissions': {
                const actionsToUpdate = message.actionIds;
                const permissionUpdates: Record<string, PermissionLevel> = {};
                for (const actionId of actionsToUpdate) {
                    permissionUpdates[actionId] = message.newPermissionLevel;
                }
                const target = this._currentContext === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
                setPermissions(permissionUpdates, target).then(
                    () => {
                        if (this._currentContext === 'user')
                            this.refreshActions();
                    },
                    (erm) => {
                        vscode.window.showErrorMessage(`Failed to update action permissions: ${erm}`);
                    },
                );
                break;
            }
            case 'error': {
                vscode.window.showErrorMessage(message.message);
                break;
            }
            case 'requestInitialization': {
                this._currentContext = message.currentContext;
                this.refreshActions();
                break;
            }
            case 'changeContext': {
                this._currentContext = message.newContext;
                this.refreshActions();
                break;
            }
        }
    }
}

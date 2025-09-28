import * as vscode from 'vscode';
import { Action } from 'neuro-game-sdk';
import { NEURO } from './constants';
import { logOutput } from './utils';

interface DeprecatedSetting {
    old: string;
    new: string | ((target: vscode.ConfigurationTarget) => Promise<void>);
}

/** Array of deprecated settings */
const DEPRECATED_SETTINGS: DeprecatedSetting[] = [
    {
        old: 'websocketUrl',
        new: 'connection.websocketUrl',
    },
    {
        old: 'gameName',
        new: 'connection.gameName',
    },
    {
        old: 'initialContext',
        new: 'connection.initialContext',
    },
    {
        old: 'includePattern',
        async new(target: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getTargetConfig<string>(cfg, 'includePattern', target)!;
            const newConfig = config.split('\n');
            await cfg.update('access.includePattern', newConfig, target);
        },
    },
    {
        old: 'excludePattern',
        async new(target: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getTargetConfig<string>(cfg, 'excludePattern', target)!;
            const newConfig = config.split('\n');
            await cfg.update('access.excludePattern', newConfig, target);
        },
    },
    {
        old: 'allowUnsafePaths',
        async new(target: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getTargetConfig<boolean>(cfg, 'allowUnsafePaths', target)!;
            await cfg.update('access.dotFiles', config, target);
            await cfg.update('access.externalFiles', config, target);
            await cfg.update('access.environmentVariables', config, target);
        },
    },
];

function getTargetConfig<T>(config: vscode.WorkspaceConfiguration, key: string, target: vscode.ConfigurationTarget) {
    switch (target) {
        case vscode.ConfigurationTarget.Global:
            return config.inspect(key)?.globalValue as T | undefined;
        case vscode.ConfigurationTarget.Workspace:
            return config.inspect(key)?.workspaceValue as T | undefined;
        case vscode.ConfigurationTarget.WorkspaceFolder:
            return config.inspect(key)?.workspaceFolderValue as T | undefined;
        default:
            return undefined;
    }
}

/** Function to check deprecated settings */
export async function checkDeprecatedSettings() {
    if (NEURO.context?.globalState.get('no-migration')) return;
    const cfg = vscode.workspace.getConfiguration('neuropilot');
    const deprecatedSettings: Record<string, Map<vscode.ConfigurationTarget, unknown>> = {};

    for (const setting of DEPRECATED_SETTINGS) {
        const inspection = cfg.inspect(setting.old);
        const targetValueMap = new Map<vscode.ConfigurationTarget, unknown>();

        // Check all possible configuration targets
        if (inspection?.globalValue !== undefined) {
            targetValueMap.set(vscode.ConfigurationTarget.Global, inspection.globalValue);
        }
        if (inspection?.workspaceValue !== undefined) {
            targetValueMap.set(vscode.ConfigurationTarget.Workspace, inspection.workspaceValue);
        }
        if (inspection?.workspaceFolderValue !== undefined) {
            targetValueMap.set(vscode.ConfigurationTarget.WorkspaceFolder, inspection.workspaceFolderValue);
        }

        if (targetValueMap.size > 0) {
            deprecatedSettings[setting.old] = targetValueMap;
        }
    }

    const keys = Object.keys(deprecatedSettings);
    if (keys.length > 0) {
        // Count total configurations across all targets
        const totalConfigs = keys.reduce((sum, key) => sum + deprecatedSettings[key].size, 0);

        // Collect all unique configuration targets that have deprecated settings
        const targetsSet = new Set<vscode.ConfigurationTarget>();
        for (const key of keys) {
            for (const target of deprecatedSettings[key].keys()) {
                targetsSet.add(target);
            }
        }

        // Convert configuration targets to readable names
        const targetNames: string[] = [];
        if (targetsSet.has(vscode.ConfigurationTarget.Global)) {
            targetNames.push('User');
        }
        if (targetsSet.has(vscode.ConfigurationTarget.Workspace)) {
            targetNames.push('Workspace');
        }
        if (targetsSet.has(vscode.ConfigurationTarget.WorkspaceFolder)) {
            targetNames.push('Workspace Folder');
        }

        const targetList = targetNames.length === 1
            ? targetNames[0]
            : targetNames.slice(0, -1).join(', ') + ', and ' + targetNames[targetNames.length - 1];

        const notif = await vscode.window.showInformationMessage(
            `You have ${totalConfigs} deprecated configuration${totalConfigs === 1 ? '' : 's'} in your ${targetList} setting${targetNames.length === 1 ? '' : 's'}. Would you like to migrate them?`,
            'Yes', 'No', 'Don\'t show again',
        );

        if (notif) {
            switch (notif) {
                case 'Yes':
                    for (const key of keys) {
                        const updateObject = DEPRECATED_SETTINGS.find(o => o.old === key);
                        const targetValueMap = deprecatedSettings[key];

                        if (updateObject && targetValueMap) {
                            // Process each configuration target for this setting
                            for (const [target, value] of targetValueMap.entries()) {
                                if (typeof updateObject.new === 'string') {
                                    // Update with the specific configuration target
                                    await cfg.update(updateObject.new, value, target);
                                    // Remove the old setting from this target
                                    await cfg.update(updateObject.old, undefined, target);
                                } else {
                                    // For custom migration functions, pass the target and value
                                    await updateObject.new(target);
                                    // Remove the old setting from this target
                                    await cfg.update(updateObject.old, undefined, target);
                                }
                            }
                        }
                    }
                    vscode.window.showInformationMessage('Configuration migration completed successfully.');
                    break;
                case 'No':
                    break;
                case 'Don\'t show again':
                    if (NEURO.context) {
                        NEURO.context.globalState.update('no-migration', true);
                    } else {
                        logOutput('ERROR', 'Couldn\'t save no-migration preference to memento because of a missing extension context.');
                    }
                    break;
            }
        }
    }
}

//#region Types

export type CursorPositionContextStyle = 'off' | 'inline' | 'lineAndColumn' | 'both';

//#endregion

/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

/**
 * Gets the value of the config
 * @param key The config key to get
 * @returns The value of the config, or `undefined` if it doesn't exist
 */
export function getConfig<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>(key);
}

export function getAccess<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>('access.' + key);
}

export function getConnection<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>('connection.' + key);
}

export function isActionEnabled(action: string | Action): boolean {
    if (typeof action === 'string')
        return !CONFIG.disabledActions.includes(action);
    return !CONFIG.disabledActions.includes(action.name);
}

/**
 * Checks the configured permission level for each provided permission and returns 
 * the lowest (most restrictive) level.
 *
 * @param permissions The permission(s) to query.
 * @returns The lowest permission level in the list of permissions.
 * If no permissions are specified, this function assumes Copilot
 */
export function getPermissionLevel(...permissions: Permission[]): PermissionLevel {
    if (NEURO.killSwitch) {
        return PermissionLevel.OFF;
    }
    if (permissions.length === 0) {
        return PermissionLevel.COPILOT;
    }
    return permissions
        .map(permission => {
            let setting = vscode.workspace.getConfiguration('neuropilot')
                .get<string>('permission.' + permission.id, 'off');
            setting = setting.toLowerCase();
            switch (setting) {
                case 'autopilot':
                    return PermissionLevel.AUTOPILOT;
                case 'copilot':
                    return PermissionLevel.COPILOT;
                default:
                    return PermissionLevel.OFF;
            }
        })
        .reduce((lowest, level) => level < lowest ? level : lowest, PermissionLevel.AUTOPILOT);
}

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
class Permissions {
    get openFiles() { return { id: 'openFiles', infinitive: 'open files' }; }
    get editActiveDocument() { return { id: 'editActiveDocument', infinitive: 'edit or view documents' }; }
    get create() { return { id: 'create', infinitive: 'create files or folders' }; }
    get rename() { return { id: 'rename', infinitive: 'rename files or folders' }; }
    get delete() { return { id: 'delete', infinitive: 'delete files or folders' }; }
    get runTasks() { return { id: 'runTasks', infinitive: 'run or terminate tasks' }; }
    get requestCookies() { return { id: 'requestCookies', infinitive: 'request cookies' }; }
    get gitOperations() { return { id: 'gitOperations', infinitive: 'use Git' }; }
    get gitTags() { return { id: 'gitTags', infinitive: 'tag commits' }; }
    get gitRemotes() { return { id: 'gitRemotes', infinitive: 'interact with Git remotes' }; }
    get editRemoteData() { return { id: 'editRemoteData', infinitive: 'edit remote data' }; }
    get gitConfigs() { return { id: 'gitConfigs', infinitive: 'edit the Git configuration' }; }
    get terminalAccess() { return { id: 'terminalAccess', infinitive: 'access the terminal' }; }
    get accessLintingAnalysis() { return { id: 'accessLintingAnalysis', infinitive: 'view linting problems' }; }
    get getUserSelection() { return { id: 'getUserSelection', infinitive: 'get Vedal\'s cursor' }; }
}

export const PERMISSIONS = new Permissions();

class Config {
    get beforeContext(): number { return getConfig('beforeContext')!; }
    get afterContext(): number { return getConfig('afterContext')!; }
    get maxCompletions(): number { return getConfig('maxCompletions')!; }
    get completionTrigger(): string { return getConfig('completionTrigger')!; }
    get timeout(): number { return getConfig('timeout')!; }
    get showTimeOnTerminalStart(): boolean { return getConfig('showTimeOnTerminalStart')!; }
    get terminalContextDelay(): number { return getConfig('terminalContextDelay')!; }
    get allowRunningAllTasks(): boolean { return getConfig('allowRunningAllTasks')!; }
    get sendNewLintingProblemsOn(): string { return getConfig('sendNewLintingProblemsOn')!; }
    get sendSaveNotifications(): boolean { return getConfig('sendSaveNotifications')!; }
    get requestExpiryTimeout(): number { return getConfig('requestExpiryTimeout')!; }
    get hideCopilotRequests(): boolean { return getConfig('hideCopilotRequests')!; }
    get cursorFollowsNeuro(): boolean { return getConfig('cursorFollowsNeuro')!; }
    get currentlyAsNeuroAPI(): string { return getConfig('currentlyAsNeuroAPI')!; }
    get docsURL(): string { return getConfig('docsURL')!; }
    get defaultOpenDocsWindow(): string { return getConfig('defaultOpenDocsWindow')!; }
    get disabledActions(): string[] { return getConfig('disabledActions')!; }
    get sendContentsOnFileChange(): boolean { return getConfig('sendContentsOnFileChange')!; }
    get cursorPositionContextStyle(): CursorPositionContextStyle { return getConfig('cursorPositionContextStyle')!; }
    get lineNumberContextFormat(): string { return getConfig('lineNumberContextFormat')!; }
    get enableCancelEvents(): boolean { return getConfig('enableCancelEvents')!; }

    get terminals(): { name: string; path: string; args?: string[]; }[] { return getConfig('terminals')!; }
}

export const CONFIG = new Config();

class Access {
    get includePattern(): string[] { return getAccess<string[]>('includePattern')!; }
    get excludePattern(): string[] { return getAccess<string[]>('excludePattern')!; }
    get dotFiles(): boolean { return getAccess<boolean>('dotFiles')!; }
    get externalFiles(): boolean { return getAccess<boolean>('externalFiles')!; }
    get environmentVariables(): boolean { return getAccess<boolean>('environmentVariables')!; }
}

export const ACCESS = new Access();

class Connection {
    get websocketUrl(): string { return getConnection<string>('websocketUrl')!; }
    get gameName(): string { return getConnection<string>('gameName')!; }
    get initialContext(): string { return getConnection<string>('initialContext')!; }
    get autoConnect(): boolean { return getConnection<boolean>('autoConnect')!; }
    get retryInterval(): number { return getConnection<number>('retryInterval')!; }
    get retryAmount(): number { return getConnection<number>('retryAmount')!; }
}

export const CONNECTION = new Connection();

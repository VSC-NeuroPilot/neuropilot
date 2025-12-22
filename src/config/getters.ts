import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { logOutput } from '@/utils';
import { getAction } from '@/rce';

//#region Types

export type CursorPositionContextStyle = 'off' | 'inline' | 'lineAndColumn' | 'both';

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

interface DeprecatedSetting {
    old: string;
    new: string | ((target: vscode.ConfigurationTarget) => Promise<void>);
}

//#endregion

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
    {
        old: 'hideCopilotRequests',
        new: 'actions.hideCopilotRequests',
    },
    {
        old: 'allowRunningAllTasks',
        new: 'actions.allowRunningAllTasks',
    },
    {
        old: 'enableCancelRequests',
        new: 'actions.enableCancelRequests',
    },
    {
        old: 'currentlyAsNeuroAPI',
        new: 'connection.nameOfAPI',
    },
    deprecatedPermission('openFiles', [
        'get_workspace_files',
        'open_file',
        'read_file',
    ]),
    deprecatedPermission('create', [
        'create_file',
        'create_folder',
    ]),
    deprecatedPermission('rename', ['rename_file_or_folder']),
    deprecatedPermission('delete', ['delete_file_or_folder']),
    deprecatedPermission('editActiveDocument', [
        'place_cursor',
        'get_cursor',
        'get_file_contents',
        'insert_text',
        'insert_lines',
        'replace_text',
        'delete_text',
        'find_text',
        'undo',
        'rewrite_all',
        'rewrite_lines',
        'delete_lines',
        'highlight_lines',
        'get_user_selection',
        'replace_user_selection',
        'diff_patch',
    ]),
    deprecatedPermission('runTasks', []),
    deprecatedPermission('requestCookies', ['request_cookie']),
    deprecatedPermission('gitOperations', [
        'init_git_repo',
        'add_file_to_git',
        'make_git_commit',
        'merge_to_current_branch',
        'git_status',
        'remove_file_from_git',
        'delete_git_branch',
        'switch_git_branch',
        'new_git_branch',
        'diff_files',
        'git_log',
        'git_blame',
        'tag_head',
        'delete_tag',
        'set_git_config',
        'get_git_config',
        'fetch_git_commits',
        'pull_git_commits',
        'push_git_commits',
        'add_git_remote',
        'remove_git_remote',
        'rename_git_remote',
    ]),
    deprecatedPermission('gitTags', [
        'tag_head',
        'delete_tag',
    ]),
    deprecatedPermission('gitConfigs', [
        'set_git_config',
        'get_git_config',
    ]),
    deprecatedPermission('gitRemotes', [
        'fetch_git_commits',
        'pull_git_commits',
        'push_git_commits',
        'add_git_remote',
        'remove_git_remote',
        'rename_git_remote',
    ]),
    deprecatedPermission('editRemoteData', [
        'add_git_remote',
        'remove_git_remote',
        'rename_git_remote',
    ]),
    deprecatedPermission('terminalAccess', [
        'execute_in_terminal',
        'kill_terminal_process',
        'get_currently_running_shells',
    ]),
    deprecatedPermission('accessLintingAnalysis', [
        'get_file_lint_problems',
        'get_folder_lint_problems',
        'get_workspace_lint_problems',
    ]),
    deprecatedPermission('getUserSelection', [
        'get_user_selection',
        'replace_user_selection',
    ]),
    { // Must be AFTER all permissions settings
        old: 'actions.disabledActions',
        async new(target: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getTargetConfig<string[]>(cfg, 'actions.disabledActions', target)!;
            const permissions = getTargetConfig<Record<string, string>>(cfg, 'actionPermissions', target) ?? {};
            for (const action of config) {
                permissions[action] = 'off';
            }
            await cfg.update('actionPermissions', permissions, target);
        },
    },
];

function deprecatedPermission(oldKey: string, affectedActions: string[]): DeprecatedSetting {
    return {
        old: 'permission.' + oldKey,
        async new(target: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getTargetConfig<string>(cfg, 'permission.' + oldKey, target)?.toLowerCase(); // Permission levels used to be capitalized
            if (!config) return;
            const configPermissionLevel = stringToPermissionLevel(config);

            const permissions = getTargetConfig<Record<string, string>>(cfg, 'actionPermissions', target) ?? {};
            for (const action of affectedActions) {
                // Take the lowest (most restrictive) permission level
                let newLevel = configPermissionLevel;
                if (action in permissions)
                    newLevel = Math.min(newLevel, stringToPermissionLevel(permissions[action]));
                permissions[action] = permissionLevelToString(newLevel);
                logOutput('INFO', `Migrated permission for action "${action}" to level ${newLevel}`);
            }
            await cfg.update('actionPermissions', permissions, target);
        },
    };
}

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
export async function checkDeprecatedSettings(version: string) {
    const noMigration = NEURO.context?.globalState.get<string>('no-migration');
    if (noMigration === version) return;
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
            'Yes', 'No', 'Don\'t show again for this update',
        );

        if (notif) {
            switch (notif) {
                case 'Yes':
                    for (const key of keys) {
                        const updateObject = DEPRECATED_SETTINGS.find(o => o.old === key);
                        const targetValueMap = deprecatedSettings[key];

                        try {
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
                        } catch (erm) {
                            logOutput('ERROR', `Failed to migrate setting "${key}": ${erm}`);
                            vscode.window.showErrorMessage(`Failed to migrate setting "${key}". See output for details.`);
                        }
                    }
                    vscode.window.showInformationMessage('Configuration migration completed successfully.');
                    break;
                case 'No':
                    break;
                case 'Don\'t show again for this update':
                    if (NEURO.context) {
                        NEURO.context.globalState.update('no-migration', version);
                    } else {
                        logOutput('ERROR', 'Couldn\'t save no-migration preference to memento, most likely because of a missing extension context.');
                    }
                    break;
            }
        }
    }
}

/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

export function permissionLevelToString(level: PermissionLevel): string {
    switch (level) {
        case PermissionLevel.AUTOPILOT:
            return 'autopilot';
        case PermissionLevel.COPILOT:
            return 'copilot';
        case PermissionLevel.OFF:
        default:
            return 'off';
    }
}

export function stringToPermissionLevel(level?: string): PermissionLevel {
    switch (level?.toLowerCase()) {
        case 'autopilot':
            return PermissionLevel.AUTOPILOT;
        case 'copilot':
            return PermissionLevel.COPILOT;
        case 'off':
        default:
            return PermissionLevel.OFF;
    }
}

//#region Config get functions

/**
 * Gets the value of the config
 * @param key The config key to get
 * @returns The value of the config, or `undefined` if it doesn't exist
 */
function getConfig<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>(key);
}

function getAccess<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot.access').get<T>(key);
}

function getConnection<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot.connection').get<T>(key);
}

function getActions<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot.actions').get<T>(key);
}

function getCosmetic<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot.cosmetic').get<T>(key);
}

//#endregion

/**
 * Computes and returns all *configured* action permissions, merging workspace folder, workspace, and global settings.
 * Workspace folder settings take precedence over workspace settings, which take precedence over global settings.
 * @returns A record mapping action names to their configured permission levels.
 */
export function getAllPermissions(): Record<string, PermissionLevel> {
    const configuration = vscode.workspace.getConfiguration('neuropilot');
    const settings = configuration.inspect<Record<string, string>>('actionPermissions');

    // Get all configurations
    const workspaceFolderValue = settings?.workspaceFolderValue;
    const workspaceValue = settings?.workspaceValue;
    const globalValue = settings?.globalValue;

    // Merge configurations, prioritizing workspace folder > workspace > global
    const permissions = { ...globalValue, ...workspaceValue, ...workspaceFolderValue };
    const result: Record<string, PermissionLevel> = {};
    for (const key in permissions) {
        result[key] = stringToPermissionLevel(permissions[key]);
    }
    return result;
}

/**
 * Checks the configured permission level for an action.
 * If no permission level is configured, the action's default permission level is used.
 * If the action has no default permission level, {@link PermissionLevel.OFF} is used.
 * @param actionName The name of the action whose permission level is to be checked.
 * @returns The permission level for the action.
 * If used as a boolean, {@link PermissionLevel.OFF} is considered `false`, everything else is considered `true`.
 */
export function getPermissionLevel(actionName: string): PermissionLevel {
    if (NEURO.killSwitch || NEURO.tempDisabledActions.includes(actionName)) {
        return PermissionLevel.OFF;
    }
    const permissions = getAllPermissions();
    const permission = permissions[actionName];

    if (permission !== undefined)
        return permission;
    return getAction(actionName)?.defaultPermission ?? PermissionLevel.OFF;
}

/**
 * Sets the specified action permissions.
 * This can lead to race conditions, so always await the returned promise.
 * The caller is responsible for handling promise rejections from write failures.
 * @param permissions The permissions to set. Will be merged with the current workspace settings.
 * @param target The configuration target to set the permissions on. Defaults to Workspace.
 */
export function setPermissions(permissions: Record<string, PermissionLevel>, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Thenable<void> {
    const configuration = vscode.workspace.getConfiguration('neuropilot');
    const inspected = configuration.inspect<Record<string, string>>('actionPermissions');
    const currentScopeValue =
        target === vscode.ConfigurationTarget.Global ? inspected?.globalValue ?? {} :
        target === vscode.ConfigurationTarget.Workspace ? inspected?.workspaceValue ?? {} :
        inspected?.workspaceFolderValue ?? {};
    const stringPermissions: Record<string, string> = {};
    for (const key in permissions) {
        stringPermissions[key] = permissionLevelToString(permissions[key]);
    }
    const mergedPermissions: Record<string, string> = { ...currentScopeValue, ...stringPermissions };
    return configuration.update('actionPermissions', mergedPermissions, target);
}

export function setPermissionLevel(actionName: string, level: PermissionLevel, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Thenable<void> {
    return setPermissions({ [actionName]: level }, target);
}

class Config {
    get beforeContext(): number { return getConfig('beforeContext')!; }
    get afterContext(): number { return getConfig('afterContext')!; }
    get maxCompletions(): number { return getConfig('maxCompletions')!; }
    get completionTrigger(): string { return getConfig('completionTrigger')!; }
    get timeout(): number { return getConfig('timeout')!; }
    get showTimeOnTerminalStart(): boolean { return getConfig('showTimeOnTerminalStart')!; }
    get terminalContextDelay(): number { return getConfig('terminalContextDelay')!; }
    get sendNewLintingProblemsOn(): string { return getConfig('sendNewLintingProblemsOn')!; }
    get sendSaveNotifications(): boolean { return getConfig('sendSaveNotifications')!; }
    get requestExpiryTimeout(): number { return getConfig('requestExpiryTimeout')!; }
    get cursorFollowsNeuro(): boolean { return getConfig('cursorFollowsNeuro')!; }
    get docsURL(): string { return getConfig('docsURL')!; }
    get defaultOpenDocsWindow(): string { return getConfig('defaultOpenDocsWindow')!; }
    get sendContentsOnFileChange(): boolean { return getConfig('sendContentsOnFileChange')!; }
    get cursorPositionContextStyle(): CursorPositionContextStyle { return getConfig('cursorPositionContextStyle')!; }
    get lineNumberContextFormat(): string { return getConfig('lineNumberContextFormat')!; }

    get terminals(): { name: string; path: string; args?: string[]; }[] { return getConfig('terminals')!; }
}

export const CONFIG = /* @__PURE__ */ new Config();

class Access {
    get includePattern(): string[] { return getAccess<string[]>('includePattern')!; }
    get excludePattern(): string[] { return getAccess<string[]>('excludePattern')!; }
    get dotFiles(): boolean { return getAccess<boolean>('dotFiles')!; }
    get externalFiles(): boolean { return getAccess<boolean>('externalFiles')!; }
    get environmentVariables(): boolean { return getAccess<boolean>('environmentVariables')!; }
    get inheritFromIgnoreFiles(): boolean { return getAccess<boolean>('inheritFromIgnoreFiles')!; }
    get ignoreFiles(): string[] { return getAccess<string[]>('ignoreFiles')!; }
    get suppressIgnoreWarning(): boolean { return getAccess<boolean>('suppressIgnoreWarning')!; }
}

export const ACCESS = /* @__PURE__ */ new Access();

class Connection {
    get websocketUrl(): string { return getConnection<string>('websocketUrl')!; }
    get gameName(): string { return getConnection<string>('gameName')!; }
    get initialContext(): string { return getConnection<string>('initialContext')!; }
    get autoConnect(): boolean { return getConnection<boolean>('autoConnect')!; }
    get retryInterval(): number { return getConnection<number>('retryInterval')!; }
    get retryAmount(): number { return getConnection<number>('retryAmount')!; }
    get userName(): string { return getConnection<string>('userName')!; }
    get nameOfAPI(): string { return getConnection<string>('nameOfAPI')!; }
}

export const CONNECTION = /* @__PURE__ */ new Connection();

class Actions {
    get hideCopilotRequests(): boolean { return getActions<boolean>('hideCopilotRequests')!; }
    get allowRunningAllTasks(): boolean { return getActions<boolean>('allowRunningAllTasks')!; }
    get enableCancelEvents(): boolean { return getActions<boolean>('enableCancelEvents')!; }
    get experimentalSchemas(): boolean { return getActions<boolean>('experimentalSchemas')!; }
}

export const ACTIONS = /* @__PURE__ */ new Actions();

class Cosmetic {
    get celebrations(): boolean { return getCosmetic('celebrations')!; }
}

export const COSMETIC = /* @__PURE__ */ new Cosmetic();

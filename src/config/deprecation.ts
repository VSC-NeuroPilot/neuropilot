import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { logOutput } from '@/utils';
import { permissionLevelToString, stringToPermissionLevel } from './getters';

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

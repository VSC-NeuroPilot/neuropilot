import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { getAction } from '@/rce';

//#region Types

export type CursorPositionContextStyle = 'off' | 'inline' | 'lineAndColumn' | 'both';

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

//#endregion

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

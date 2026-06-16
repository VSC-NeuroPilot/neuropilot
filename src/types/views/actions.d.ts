import type { PermissionLevel } from '../actions';

export type SettingsContext = 'user' | 'workspace';

export interface ActionNode {
    id: string;
    label: string;
    category: string;
    description?: string;
    permissionLevel: PermissionLevel;
    modifiedInCurrentContext: boolean;
    modifiedExternally: boolean;
    isRegistered: boolean;
}

export type ActionsViewProviderMessage = {
    type: 'providerToggledPermission';
    actionId: string;
    newPermissionLevel: PermissionLevel;
} | {
    type: 'refreshActions';
    actions: ActionNode[];
};

export type ActionsViewMessage = {
    type: 'viewToggledPermissions';
    actionIds: string[];
    newPermissionLevel: PermissionLevel;
} | {
    type: 'error';
    message: string;
} | {
    type: 'requestInitialization';
    currentContext: SettingsContext;
} | {
    type: 'changeContext';
    newContext: SettingsContext;
};
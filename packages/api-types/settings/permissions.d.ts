/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

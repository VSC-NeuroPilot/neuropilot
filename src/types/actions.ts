/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

export type ActionStatus = 'pending' | 'success' | 'failure' | 'denied' | 'exception' | 'timeout' | 'schema' | 'cancelled';

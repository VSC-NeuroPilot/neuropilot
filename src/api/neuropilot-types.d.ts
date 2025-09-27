export interface ExtensionAPI {
    version: number;
    [key: string]: unknown;
}

export interface ConnectionStatus {
    connected: boolean;
    url: string | null;
    error?: string;
}

export interface NeuroMessage {
    id: string;
    content: string;
    timestamp: Date;
    type: 'request' | 'response' | 'notification';
    metadata?: Record<string, unknown>;
}

export interface ExtensionInfo {
    author?: string;
    description?: string;
    runsIn?: string[];
    docs?: {
        base: string;
    };
    registersActions?: boolean;
    sendsPassiveContexts?: boolean;
    canForceActions?: boolean;
    accessNeuroCursor?: boolean;
    usesFilePaths?: boolean;
}

export interface RegistrationName {
    display: string;
    id: string;
    nameOnActions: string;
}

export interface ExtensionRegisterReturns {
    id: string;
    actionPrefix: string;
    token: string;
}

export interface ModifyMetadata {
    displayName?: string;
    nameOnActions?: string;
    docsURL?: string;
}

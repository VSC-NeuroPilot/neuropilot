import { Event } from 'vscode';

export type APIVersions = 1 | 'latest' | 'oldest' | 'next';

export interface NeuroPilotAPI {
    /** Whether or not NeuroPilot is connected to the Neuro API. */
    readonly connected: boolean;
    /** 
     * Event that fires if the Neuro API connection status changes.
     * Only fires once all connection attempts have been exhausted.
     */
    readonly onDidChangeConnectionStatus: Event<boolean>;

    registerExtension(details: ExtensionInfo): ExtensionRegisterReturns;

    getAPI(version: APIVersions): ExtensionAPI;
    getSupportedVersions(): APIVersions[];
}

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

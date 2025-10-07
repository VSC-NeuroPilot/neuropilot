export * as v1 from './v1';

import { Event } from 'vscode';

export type APIVersions = 1 | 'latest' | 'oldest' | 'next';

export const enum ConnectionTypes {
    Connected,
    Disconnected,
    Failed,
    Retrying,
}

export interface NeuroPilotAPI {
    /** Whether or not NeuroPilot is connected to the Neuro API. */
    readonly connected: Omit<ConnectionTypes, ConnectionTypes.Failed>;
    /** Current connection info, assuming {@link NeuroPilotAPI.connected} returns {@link ConnectionTypes.Connected} */
    readonly connectionInfo: ConnectionStatus | null;
    /** 
     * Event that fires if the Neuro API connection status changes.
     * Only fires on fail once all connection attempts have been exhausted.
     * @fires ConnectionType - see {@link ConnectionTypes}
     */
    readonly onDidChangeConnectionStatus: Event<Omit<ConnectionStatus, ConnectionTypes.Retrying>>;

    /** @todo Stay in pre-API exports? */
    registerExtension(details: ExtensionInfo): ExtensionRegisterReturns;

    getAPI(version: APIVersions): ExtensionAPI;
    /** Array of supported version numbers. */
    readonly supportedVersions: Omit<APIVersions, 'latest' & 'oldest' & 'next'>[];
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

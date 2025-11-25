export * as v1 from './v1';

import { Event } from 'vscode';

export type APIVersion = 1 | 'latest' | 'oldest' | 'next';

export const enum ConnectionTypes {
    Connected,
    Disconnected,
    Failed,
    Retrying,
}

export interface APIWrapper {
    // /** Whether or not NeuroPilot is connected to the Neuro API. */
    // readonly connected: Omit<ConnectionTypes, ConnectionTypes.Failed>;
    // /** Current connection info, assuming {@link APIWrapper.connected} returns {@link ConnectionTypes.Connected} */
    // readonly connectionInfo: ConnectionStatus | null;
    // /** 
    //  * Event that fires if the Neuro API connection status changes.
    //  * Only fires on fail once all connection attempts have been exhausted.
    //  * @fires ConnectionType - see {@link ConnectionTypes}
    //  */
    // readonly onDidChangeConnectionStatus: Event<Omit<ConnectionStatus, ConnectionTypes.Retrying>>;

    registerCompanion(extension: CompanionExtension): ExtensionAPI;

    // getAPI(version: APIVersion): ExtensionAPI;
    // /** Array of supported version numbers. */
    // readonly supportedVersions: Omit<APIVersion, 'latest' & 'oldest' & 'next'>[];
}

export interface ExtensionAPI {
    version: number;
}

export interface ConnectionStatus {
    connected: boolean;
    url: string | null;
    error?: string;
}

export interface CompanionExtension {
    apiVersion: APIVersion;
    extensionId: string;
    name: string;
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

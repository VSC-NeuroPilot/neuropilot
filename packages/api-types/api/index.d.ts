export type APIVersion = 1 | 'latest' | 'oldest' | 'next';

export const enum ConnectionStatus {
    Connected,
    Disconnected,
    Failed,
    Retrying,
}

export interface NeuroPilotAPIWrapper {
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

    /**
     * Register the companion extension and get the requested API version.
     * @param extension An object containing callbacks and extension information, as well as the API version to request.
     * @return The requested extension API.
     * @throws If the requested API version is not supported.
     */
    registerCompanion(extension: CompanionExtension): ExtensionAPI;

    // getAPI(version: APIVersion): ExtensionAPI;
    // /** Array of supported version numbers. */
    // readonly supportedVersions: Omit<APIVersion, 'latest' & 'oldest' & 'next'>[];
}

export interface ExtensionAPI {
    version: number;
}

// export interface ConnectionStatus {
//     connected: boolean;
//     url: string | null;
//     error?: string;
// }

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

// export interface RegistrationName {
//     display: string;
//     id: string;
//     nameOnActions: string;
// }

// export interface ExtensionRegisterReturns {
//     id: string;
//     actionPrefix: string;
//     token: string;
// }

// export interface ModifyMetadata {
//     displayName?: string;
//     nameOnActions?: string;
//     docsURL?: string;
// }

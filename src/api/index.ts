import { APIVersions, ExtensionAPI } from '@vsc-neuropilot/api-types';
import { getAPIv1 } from './versions/1';

/**
 * Main entry point for the extension API.
 * Other extensions can access this through vscode.extensions.getExtension().exports
 */
export function getAPI(version: APIVersions): ExtensionAPI | null {
    switch (version) {
        case 1:
            return getAPIv1();
        default:
            return null;
    }
}

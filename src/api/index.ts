import { APIVersion, ExtensionAPI, CompanionExtension, NeuroPilotAPIWrapper } from '@vsc-neuropilot/api-types/api';
import { getAPIv1 } from './versions/1';

export type CompanionToken = string;

// TODO: Placeholder implementation
export const COMPANIONS = /* @__PURE__ */ new Map<CompanionToken, CompanionExtension>();

function generateToken(info: CompanionExtension): CompanionToken {
    return `ext_${info.extensionId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

function registerExtension(extension: CompanionExtension): CompanionToken {
    const token = generateToken(extension);
    COMPANIONS.set(token, extension);
    return token;
}

/**
 * Main entry point for the extension API.
 * Other extensions can access this through vscode.extensions.getExtension().exports
 * @throws If the requested API version is not supported.
 */
function getAPI(token: CompanionToken, version: APIVersion): ExtensionAPI {
    switch (version) {
        case 1:
            return getAPIv1(token);
        default:
            throw new Error(`Unsupported API version: ${version}`);
    }
}

export class APIWrapperImpl implements NeuroPilotAPIWrapper {
    registerCompanion(extension: CompanionExtension): ExtensionAPI {
        // TODO: Handle null case
        const token = registerExtension(extension);
        try {
            return getAPI(token, extension.apiVersion)!;
        } catch (erm) {
            COMPANIONS.delete(token);
            throw erm;
        }
    }
}

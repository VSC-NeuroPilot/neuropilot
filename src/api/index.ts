import { APIVersion, ConnectionStatus, ConnectionTypes, ExtensionAPI, CompanionExtension, ExtensionRegisterReturns, APIWrapper } from '@vsc-neuropilot/api-types/api';
import { getAPIv1 } from './versions/1';
import * as vscode from 'vscode';
import { CompanionExtensionV1 } from '@vsc-neuropilot/api-types/api/v1';

export type CompanionToken = string;

// TODO: Placeholder implementation
const COMPANIONS = /* @__PURE__ */ new Map<CompanionToken, CompanionExtension>();

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
 */
function getAPI(token: CompanionToken, version: APIVersion): ExtensionAPI | null {
    switch (version) {
        case 1:
            return getAPIv1(token);
        default:
            return null;
    }
}

export class APIWrapperImpl implements APIWrapper {
    registerCompanion(extension: CompanionExtension): ExtensionAPI {
        // TODO: Handle null case
        const token = registerExtension(extension);
        return getAPI(token, extension.apiVersion)!;
    }
}

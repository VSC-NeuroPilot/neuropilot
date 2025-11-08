/**
 * Translation utilities for converting MCP tools to Neuro actions.
 *
 * This code does the following:
 * - MCP tool names -> Neuro action names
 * - Data parsing (Neuro action data -> MCP tool arguments)
 */

import type { JSONSchema7 } from 'json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Sanitizes an MCP tool name to be compatible with Neuro action naming rules.
 * All MCP tools are prefixed with "mcp_" to distinguish them from native NeuroPilot actions.
 *
 * Neuro action names should:
 * - Only contain lowercase letters, numbers, underscores, and hyphens
 * - Not have consecutive underscores
 * - Not start or end with underscores
 *
 * @param name - The original MCP tool name
 * @returns A sanitized action name suitable for Neuro, prefixed with "mcp_"
 *
 * @example
 * sanitizeActionName('GetFileContent') // => 'mcp_get_file_content'
 * sanitizeActionName('fetch_url') // => 'mcp_fetch_url'
 * sanitizeActionName('mcp_tool') // => 'mcp_tool' (already has prefix)
 */
export function sanitizeActionName(name: string): string {
    // Convert to lowercase
    let sanitized = name.toLowerCase();

    // Replace invalid characters with underscore
    // Valid: a-z, 0-9, _, -
    sanitized = sanitized.replace(/[^a-z0-9_-]/g, '_');

    // Remove consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Remove leading and trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // Fallback if the name becomes empty
    if (!sanitized) {
        sanitized = 'unnamed_action';
    }

    // Add "mcp_" prefix if not already present
    if (!sanitized.startsWith('mcp_')) {
        sanitized = 'mcp_' + sanitized;
    }

    return sanitized;
}

/**
 * Parses action data string from Neuro API into a parameters object for MCP tools.
 *
 * @param dataStr - The action data string from Neuro (JSON-encoded or null)
 * @returns A parameters object for the MCP tool, or an empty object if parsing fails
 *
 * @example
 * parseActionData('{"path": "/tmp/file.txt", "mode": "read"}')
 * // => { path: '/tmp/file.txt', mode: 'read' }
 *
 * @example
 * parseActionData('null') // => {}
 * parseActionData(null) // => {}
 * parseActionData('') // => {}
 */
export function parseActionData(dataStr: string | null | undefined): Record<string, unknown> {
    // Handle null, undefined, or empty string
    if (!dataStr || dataStr === 'null') {
        return {};
    }

    try {
        const parsed = JSON.parse(dataStr);

        // Only return if it's an object (not array, null, etc.)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }

        return {};
    } catch {
        // If parsing fails, return empty object
        return {};
    }
}

/**
 * Type alias for MCP Tool from the SDK.
 * Re-exported for convenience.
 */
export type MCPTool = Tool;

/**
 * Type definition for a Neuro Action (from neuro-game-sdk).
 * This is what we register with the Neuro API.
 */
export interface NeuroAction {
    name: string;
    description: string;
    schema?: JSONSchema7;
}

/**
 * Converts an MCP tool definition to a Neuro action definition.
 *
 * This is the main translation function that:
 * - Sanitizes the tool name
 * - Extracts/defaults the description
 *
 * @param tool - The MCP tool to convert
 * @returns A Neuro action ready for registration
 *
 * @example
 * mcpToolToNeuroAction({
 *   name: 'GetFileContent',
 *   description: 'Reads a file from disk',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: 'File path' }
 *     },
 *     required: ['path'],
 *     additionalProperties: false
 *   }
 * })
 * // => {
 * //   name: 'mcp_get_file_content',
 * //   description: 'Reads a file from disk',
 * //   schema: {
 * //     type: 'object',
 * //     properties: { path: { type: 'string', description: 'File path' } },
 * //     required: ['path'],
 * //     additionalProperties: false
 * //   }
 * // }
 */
export function mcpToolToNeuroAction(tool: MCPTool): NeuroAction {
    // Sanitize the name
    const actionName = sanitizeActionName(tool.name);

    // Use provided description or create a default one
    const description = tool.description || `Execute ${tool.name}`;

    // RCE will handle validation using jsonschema library
    const schema = (tool.inputSchema as JSONSchema7) || { type: 'object' };

    return {
        name: actionName,
        description,
        schema,
    };
}

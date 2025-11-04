/**
 * Translation utilities for converting MCP tools to Neuro actions.
 *
 * This code does the following:
 * - MCP tool names -> Neuro action names
 * - Remove unsupported JSON Schema keywords
 * - Data parsing (Neuro action data -> MCP tool arguments)
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * JSON Schema keywords that are forbidden in Neuro action schemas.
 * See https://github.com/VedalAI/neuro-game-sdk/blob/main/API/SPECIFICATION.md#action
 * These should be removed to ensure compatibility with Neuro.
 */
export const FORBIDDEN_SCHEMA_KEYS = new Set([
    // Schema metadata
    '$anchor',
    '$comment',
    '$defs',
    '$dynamicAnchor',
    '$dynamicRef',
    '$id',
    '$ref',
    '$schema',
    '$vocabulary',
    'additionalProperties',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'contentEncoding',
    'contentMediaType',
    'contentSchema',
    'if',
    'then',
    'else',
    'dependentRequired',
    'dependentSchemas',
    'maxProperties',
    'minProperties',
    'patternProperties',
    'unevaluatedItems',
    'unevaluatedProperties',
    'multipleOf',
    'title',
    'description',
    'deprecated',
    'readOnly',
    'writeOnly',
] as const);

/**
 * Sanitizes an MCP tool name to be compatible with Neuro action naming rules.
 *
 * Neuro action names should:
 * - Only contain lowercase letters, numbers, underscores, and hyphens
 * - Not have consecutive underscores
 * - Not start or end with underscores
 *
 * @param name - The original MCP tool name
 * @returns A sanitized action name suitable for Neuro
 *
 * @example
 * sanitizeActionName('GetFileContent') // => 'get_file_content'
 * sanitizeActionName('MCP::Tool-Name!') // => 'mcp_tool_name'
 * sanitizeActionName('__multiple___underscores__') // => 'multiple_underscores'
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
    return sanitized || 'unnamed_action';
}

/**
 * Recursively simplifies a JSON Schema by removing forbidden keywords.
 * However it's highly recommended to avoid using forbidden keywords if possible to avoid unexpected output
 *
 *
 * @param schema - The JSON Schema to simplify (or null/undefined)
 * @returns A simplified schema compatible with Neuro, or a default object schema if input is null/undefined
 *
 * @example
 * simplifySchema({
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   additionalProperties: false,  // Removed
 *   description: 'A person'        // Removed
 * })
 * // => { type: 'object', properties: { name: { type: 'string' } } }
 *
 * @example
 * simplifySchema({
 *   anyOf: [
 *     { type: 'string' },
 *     { type: 'number' }
 *   ]
 * })
 * // => { type: 'string' } (takes first option)
 */
export function simplifySchema(schema: JSONSchema7 | null | undefined): JSONSchema7 {
    if (!schema) {
        return { type: 'object' };
    }

    return simplifySchemaRecursive(schema) as JSONSchema7 || { type: 'object' };
}

/**
 * Internal recursive function for schema simplification.
 */
function simplifySchemaRecursive(obj: unknown): unknown {
    // Non-objects pass through unchanged
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => simplifySchemaRecursive(item));
    }

    // Process object properties
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        // Skip forbidden keys
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (FORBIDDEN_SCHEMA_KEYS.has(key as any)) {
            // Special handling for composition keywords
            if ((key === 'anyOf' || key === 'oneOf' || key === 'allOf') && Array.isArray(value) && value.length > 0) {
                // Take the first option and merge it into the result
                const firstOption = simplifySchemaRecursive(value[0]);
                if (typeof firstOption === 'object' && firstOption !== null && !Array.isArray(firstOption)) {
                    Object.assign(result, firstOption);
                }
            }
            continue;
        }

        // Recursively process nested values
        result[key] = simplifySchemaRecursive(value);
    }

    return result;
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
 * Temporary type definition for MCP Tool (until we integrate the MCP SDK).
 * This matches the structure from @modelcontextprotocol/sdk.
 */
export interface MCPTool {
    name: string;
    description?: string;
    inputSchema?: JSONSchema7;
}

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
 * This is the main translation function that combines all the utilities:
 * 1. Sanitizes the tool name
 * 2. Extracts/defaults the description
 * 3. Simplifies the input schema
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
 * //   name: 'get_file_content',
 * //   description: 'Reads a file from disk',
 * //   schema: {
 * //     type: 'object',
 * //     properties: { path: { type: 'string' } },
 * //     required: ['path']
 * //   }
 * // }
 */
export function mcpToolToNeuroAction(tool: MCPTool): NeuroAction {
    // Sanitize the name
    const actionName = sanitizeActionName(tool.name);

    // Use provided description or create a default one
    const description = tool.description || `Execute ${tool.name}`;

    // Simplify the schema
    const schema = simplifySchema(tool.inputSchema || null);

    return {
        name: actionName,
        description,
        schema,
    };
}

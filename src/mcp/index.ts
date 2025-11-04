/**
 * MCP (Model Context Protocol) Integration Module
 *
 * This module provides functionality to connect to MCP servers,
 * translate MCP tools to Neuro actions, and execute MCP tools
 * when Neuro calls the corresponding actions.
 */

// Export translation utilities
export {
    sanitizeActionName,
    simplifySchema,
    parseActionData,
    mcpToolToNeuroAction,
    FORBIDDEN_SCHEMA_KEYS,
    type MCPTool,
    type NeuroAction,
} from './translation';

// Export tool registry
export { ToolRegistry } from './registry';

// Export MCP client
export { MCPClient, type MCPServerConfig, type ToolCallResult } from './mcp_client';

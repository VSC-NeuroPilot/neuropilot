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

// Export MCP manager
export { MCPManager } from './mcp_manager';

// Export MCP actions (main integration point)
export {
    mcpManager,
    registerMCPActions,
    unregisterMCPActions,
    refreshMCPActions,
    getMCPStatus,
    isMCPAction,
    autoConnectMCP,
} from './mcp_actions';

// Export MCP commands
export { registerMCPCommands } from './mcp_commands';

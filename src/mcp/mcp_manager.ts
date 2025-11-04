/**
 * MCP Manager for managing a single MCP server connection.
 *
 * This manager handles:
 * - Single MCP server lifecycle (connect/disconnect)
 * - Tool discovery and registry management
 * - Tool execution routing
 * - Connection health monitoring
 */

import { MCPClient, type MCPServerConfig, type ToolCallResult } from './mcp_client';
import { ToolRegistry } from './registry';
import { mcpToolToNeuroAction, type NeuroAction } from './translation';
import { logOutput } from '../utils';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Manager for a single MCP server connection.
 * Simplifies management by supporting only one server at a time.
 * For multiple servers, use a relay MCP server.
 */
export class MCPManager {
    private client: MCPClient | null = null;
    private registry = new ToolRegistry();
    private config: MCPServerConfig | null = null;
    private tools: Tool[] = [];

    /**
     * Checks if a server is currently connected.
     */
    get isConnected(): boolean {
        return this.client?.isConnected ?? false;
    }

    /**
     * Gets the current server configuration.
     */
    get serverConfig(): MCPServerConfig | null {
        return this.config;
    }

    /**
     * Gets all currently registered Neuro actions (sanitized tool names).
     */
    get registeredActions(): string[] {
        return this.registry.getAllNeuroActions();
    }

    /**
     * Gets all available MCP tools.
     */
    get availableTools(): readonly Tool[] {
        return this.tools;
    }

    /**
     * Gets the number of registered tools.
     */
    get toolCount(): number {
        return this.tools.length;
    }

    /**
     * Connects to an MCP server and discovers available tools.
     *
     * @param config - Server configuration (URL and optional timeout)
     * @returns Array of Neuro actions ready for registration
     * @throws Error if connection fails
     */
    async connect(config: MCPServerConfig): Promise<NeuroAction[]> {
        // Disconnect existing connection if any
        if (this.client) {
            logOutput('INFO', 'Disconnecting existing MCP server before connecting to new one');
            await this.disconnect();
        }

        try {
            logOutput('INFO', `MCP Manager: Connecting to server at ${config.url}`);

            // Create and connect client
            this.client = new MCPClient(config);
            await this.client.connect();
            this.config = config;

            // Discover tools
            return await this.refreshTools();
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `MCP Manager: Connection failed: ${errorMessage}`);

            // Cleanup on failure
            this.client = null;
            this.config = null;

            throw erm;
        }
    }

    /**
     * Refreshes the list of available tools from the server.
     * Updates the registry with new tools.
     *
     * @returns Array of Neuro actions ready for registration
     * @throws Error if not connected or refresh fails
     */
    async refreshTools(): Promise<NeuroAction[]> {
        if (!this.client || !this.isConnected) {
            throw new Error('MCP Manager: Not connected to any server');
        }

        try {
            logOutput('INFO', 'MCP Manager: Refreshing tools from server');

            // Get tools from server
            this.tools = await this.client.refreshCapabilities();

            // Clear old registry and rebuild
            this.registry.clear();

            // Convert tools to Neuro actions and register mappings
            const actions: NeuroAction[] = [];
            for (const tool of this.tools) {
                const action = mcpToolToNeuroAction(tool);
                this.registry.register(action.name, tool.name);
                actions.push(action);
            }

            logOutput('INFO', `MCP Manager: Registered ${actions.length} tools`);

            return actions;
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `MCP Manager: Failed to refresh tools: ${errorMessage}`);
            throw erm;
        }
    }

    /**
     * Calls an MCP tool by its Neuro action name.
     *
     * @param neuroActionName - The sanitized Neuro action name
     * @param params - Parameters to pass to the tool
     * @returns Result of the tool execution
     */
    async callTool(neuroActionName: string, params?: Record<string, unknown>): Promise<ToolCallResult> {
        if (!this.client || !this.isConnected) {
            return {
                success: false,
                result: 'MCP Manager: Not connected to any server',
            };
        }

        // Look up the original MCP tool name
        const mcpToolName = this.registry.getMCPToolName(neuroActionName);
        if (!mcpToolName) {
            return {
                success: false,
                result: `MCP Manager: Unknown action "${neuroActionName}"`,
            };
        }

        try {
            logOutput('DEBUG', `MCP Manager: Calling tool "${mcpToolName}" (action: ${neuroActionName})`);
            return await this.client.callTool(mcpToolName, params);
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `MCP Manager: Tool call failed: ${errorMessage}`);
            return {
                success: false,
                result: `Tool execution failed: ${errorMessage}`,
            };
        }
    }

    /**
     * Checks if a Neuro action name corresponds to a registered MCP tool.
     *
     * @param neuroActionName - The Neuro action name to check
     * @returns True if this is a registered MCP tool
     */
    isMCPAction(neuroActionName: string): boolean {
        return this.registry.hasNeuroAction(neuroActionName);
    }

    /**
     * Gets the original MCP tool name for a Neuro action.
     *
     * @param neuroActionName - The Neuro action name
     * @returns The original MCP tool name, or undefined if not found
     */
    getMCPToolName(neuroActionName: string): string | undefined {
        return this.registry.getMCPToolName(neuroActionName);
    }

    /**
     * Checks the health of the current connection.
     *
     * @returns True if connection is healthy, false otherwise
     */
    async checkHealth(): Promise<boolean> {
        if (!this.client) {
            return false;
        }
        return await this.client.checkHealth();
    }

    /**
     * Disconnects from the current MCP server and clears all registrations.
     */
    async disconnect(): Promise<void> {
        if (!this.client) {
            logOutput('INFO', 'MCP Manager: No server connected');
            return;
        }

        try {
            logOutput('INFO', 'MCP Manager: Disconnecting from server');

            await this.client.disconnect();

            // Clear state
            this.client = null;
            this.config = null;
            this.tools = [];
            this.registry.clear();

            logOutput('INFO', 'MCP Manager: Disconnected and cleaned up');
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('WARN', `MCP Manager: Error during disconnect: ${errorMessage}`);

            // Force cleanup even on error
            this.client = null;
            this.config = null;
            this.tools = [];
            this.registry.clear();
        }
    }

    /**
     * Gets a summary of the manager state for debugging.
     *
     * @returns String representation of manager state
     */
    toString(): string {
        if (!this.isConnected) {
            return 'MCPManager { status: disconnected }';
        }

        return [
            'MCPManager {',
            `  server: ${this.config?.url}`,
            `  connected: ${this.isConnected}`,
            `  tools: ${this.tools.length}`,
            `  actions: ${this.registeredActions.join(', ')}`,
            '}',
        ].join('\n');
    }
}

/**
 * MCP Client for connecting to Model Context Protocol servers.
 *
 * This client uses the Streamable-HTTP transport
 * to communicate with MCP servers via the /mcp endpoint since SSE is deprecated
 */

import { NEURO } from '../constants';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import type { Tool } from '@modelcontextprotocol/sdk/types';
import { logOutput } from '../utils';

/**
 * Result of a tool execution.
 */
export interface ToolCallResult {
    success: boolean;
    result: string;
}

/**
 * Configuration for MCP server connection.
 */
export interface MCPServerConfig {
    /** URL of the MCP server (e.g., "http://localhost:3000") */
    url: string;
    /** Optional timeout in milliseconds for requests (default: 30000) */
    timeout?: number;
}

/**
 * MCP Client for connecting to and interacting with MCP servers.
 *
 * Supports:
 * - Streamable-HTTP transport via /mcp endpoint
 * - Tool discovery (listTools)
 * - Tool execution (callTool)
 * - Connection health checks
 *
 * @example
 * const client = new MCPClient({
 *   url: 'http://localhost:3000'
 * });
 *
 * await client.connect();
 * const tools = await client.refreshCapabilities();
 * const result = await client.callTool('my_tool', { param: 'value' });
 * await client.disconnect();
 */
export class MCPClient {
    private client: Client | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    private connected = false;
    private tools: Tool[] = [];
    private config: Required<MCPServerConfig>;

    constructor(config: MCPServerConfig) {
        this.config = {
            url: config.url,
            timeout: config.timeout ?? 30000,
        };
    }

    /**
     * Gets the current connection status.
     */
    get isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    /**
     * Gets the list of available tools.
     * Call refreshCapabilities() first to populate this list.
     */
    get availableTools(): readonly Tool[] {
        return this.tools;
    }

    /**
     * Connects to the MCP server using Streamable-HTTP transport.
     *
     * @throws Error if connection fails
     */
    async connect(): Promise<void> {
        if (this.connected) {
            logOutput('WARN', 'MCP Client is already connected');
            return;
        }

        try {
            // Create transport using the /mcp endpoint (Streamable HTTP)
            const mcpUrl = new URL('/mcp', this.config.url);

            logOutput('INFO', `Connecting to MCP server at ${mcpUrl.toString()}`);

            // Create Streamable HTTP transport
            this.transport = new StreamableHTTPClientTransport(mcpUrl);

            // Create MCP client
            this.client = new Client(
                {
                    name: 'neuropilot-mcp-client',
                    version: '1.0.0',
                },
                {
                    capabilities: {},
                },
            );

            // Connect the client to the transport
            await this.client.connect(this.transport);

            this.connected = true;

            if (NEURO.client && NEURO.connected) {
                NEURO.client.sendContext('A MCP server is connected but no MCP tools are registered yet.');
            }

            logOutput('INFO', 'MCP Client connected successfully');
        } catch (erm) {
            this.connected = false;
            this.client = null;
            this.transport = null;

            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `Failed to connect to MCP server: ${errorMessage}`);
            throw new Error(`MCP connection failed: ${errorMessage}`);
        }
    }

    /**
     * Refreshes the list of available tools from the MCP server.
     *
     * @returns Array of available tools
     * @throws Error if not connected or if listing tools fails
     */
    async refreshCapabilities(): Promise<Tool[]> {
        if (!this.client || !this.connected) {
            throw new Error('MCP Client not connected. Call connect() first.');
        }

        try {
            logOutput('INFO', 'Refreshing MCP capabilities (listing tools)');

            const response = await this.client.listTools();
            this.tools = response.tools;

            logOutput('INFO', `Found ${this.tools.length} MCP tools`);

            // Log tool names for debugging
            if (this.tools.length > 0) {
                const toolNames = this.tools.map(t => t.name).join(', ');
                logOutput('DEBUG', `Available tools: ${toolNames}`);
            }

            return this.tools;
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `Failed to list MCP tools: ${errorMessage}`);
            throw new Error(`Failed to refresh MCP capabilities: ${errorMessage}`);
        }
    }

    /**
     * Calls a tool on the MCP server and get text result
     *
     * @param toolName - Name of the tool to call
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     * @throws Error if not connected or if tool execution fails
     */
    async callTool(toolName: string, args?: Record<string, unknown>): Promise<ToolCallResult> {
        if (!this.client || !this.connected) {
            return {
                success: false,
                result: 'MCP Client not connected',
            };
        }

        try {
            logOutput('DEBUG', `Calling MCP tool: ${toolName}`);

            const response = await this.client.callTool({
                name: toolName,
                arguments: args ?? {},
            });

            // Extract text content from response. 
            // No image data (often as base64 string) will be returned from this method 
            // so as to avoid corrupting Neuro's context
            const messages: string[] = [];
            if (response.content && Array.isArray(response.content)) {
                for (const item of response.content) {
                    if (typeof item === 'object' && item !== null && 'type' in item) {
                        if (item.type === 'text' && 'text' in item) {
                            messages.push(String(item.text));
                        }
                    }
                }
            }

            const result = messages.join('\n');
            logOutput('DEBUG', `MCP tool ${toolName} completed successfully`);

            return {
                success: true,
                result,
            };
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `MCP tool ${toolName} failed: ${errorMessage}`);

            // Check if this is a connection error
            if (errorMessage.includes('closed') || errorMessage.includes('disconnected')) {
                this.connected = false;
            }

            return {
                success: false,
                result: `Tool execution failed: ${errorMessage}`,
            };
        }
    }

    /**
     * Checks if the connection is healthy by attempting to list tools.
     *
     * @returns true if connection is healthy, false otherwise
     */
    async checkHealth(): Promise<boolean> {
        if (!this.connected || !this.client) {
            return false;
        }

        try {
            await this.client.listTools();
            return true;
        } catch {
            this.connected = false;
            return false;
        }
    }

    /**
     * Finds a tool by name in the available tools list.
     *
     * @param toolName - Name of the tool to find
     * @returns The tool if found, undefined otherwise
     */
    findTool(toolName: string): Tool | undefined {
        return this.tools.find(t => t.name === toolName);
    }

    /**
     * Checks if a tool exists in the available tools list.
     *
     * @param toolName - Name of the tool to check
     * @returns true if the tool exists, false otherwise
     */
    hasTool(toolName: string): boolean {
        return this.tools.some(t => t.name === toolName);
    }

    /**
     * Disconnects from the MCP server and cleans up resources.
     */
    async disconnect(): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            logOutput('INFO', 'Disconnecting from MCP server');

            if (this.client) {
                await this.client.close();
            }

            this.client = null;
            this.transport = null;
            this.connected = false;
            this.tools = [];

            if (NEURO.client && NEURO.connected) {
                NEURO.client.sendContext('MCP server is disconnected, thus no MCP tools will be available from now on.');
            }

            logOutput('INFO', 'MCP Client disconnected');
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('WARN', `Error during MCP disconnect: ${errorMessage}`);

            // Force cleanup even if disconnect fails
            this.client = null;
            this.transport = null;
            this.connected = false;
            this.tools = [];
        }
    }

    /**
     * Gets a summary of the current client state for debugging.
     *
     * @returns String representation of client state
     */
    toString(): string {
        return [
            'MCPClient {',
            `  url: ${this.config.url}`,
            `  connected: ${this.connected}`,
            `  tools: ${this.tools.length}`,
            '}',
        ].join('\n');
    }
}

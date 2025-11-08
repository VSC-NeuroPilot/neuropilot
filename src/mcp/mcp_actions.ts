/**
 * MCP Actions integration for NeuroPilot.
 *
 * This module handles:
 * - Registration/unregistration of MCP tools as Neuro actions
 * - Execution of MCP tools when called by Neuro
 * - Safety validation and confirmation dialogs (Copilot mode)
 */

import { NEURO } from '../constants';
import { logOutput } from '../utils';
import { isActionEnabled, PERMISSIONS, PermissionLevel, MCP, getPermissionLevel } from '../config';
import { ActionData, RCEAction, stripToActions } from '../neuro_client_helper';
import { MCPManager } from './mcp_manager';
import type { NeuroAction } from './translation';
import type { MCPServerConfig } from './mcp_client';

/**
 * Global MCP manager instance.
 * Manages a single MCP server connection.
 */
export const mcpManager = new MCPManager();

/**
 * Storage for dynamically created MCP actions.
 * Maps Neuro action names to RCEAction objects.
 */
const mcpActions: Record<string, RCEAction> = {};

/**
 * Connects to an MCP server and registers all available tools as Neuro actions.
 *
 * @param config - MCP server configuration
 * @returns Number of tools registered, or -1 on failure
 *
 * @example
 * await registerMCPActions({
 *   url: 'http://localhost:3000',
 *   timeout: 30000
 * });
 */
export async function registerMCPActions(config: MCPServerConfig): Promise<number> {
    try {
        // First, unregister any existing MCP actions
        if (mcpManager.isConnected) {
            logOutput('INFO', 'MCP: Disconnecting existing server before registering new one');
            await unregisterMCPActions();
        }

        logOutput('INFO', `MCP: Connecting to server at ${config.url}`);

        // Connect to server and get available tools
        const neuroActions = await mcpManager.connect(config);

        if (neuroActions.length === 0) {
            logOutput('WARN', 'MCP: Server has no tools available');
            return 0;
        }

        // Convert Neuro actions to RCE actions with handlers
        const rceActions = neuroActions.map(action => createMCPAction(action));

        // Store actions for later reference
        for (const action of rceActions) {
            mcpActions[action.name] = action;
        }

        // Register with Neuro client
        if (NEURO.client && NEURO.connected) {
            const enabledActions = rceActions.filter(a => isActionEnabled(a));
            NEURO.client.registerActions(stripToActions(enabledActions));
            logOutput('INFO', `MCP: Registered ${enabledActions.length} tools as Neuro actions`);

            // Send context message to Neuro about the new tools
            const toolCount = enabledActions.length;
            if (toolCount > 0) {
                const contextMessage = `An MCP server with ${toolCount} tool${toolCount === 1 ? '' : 's'} is now connected. You may access these tools whose names start with \`mcp_\`.`;
                NEURO.client.sendContext(contextMessage);
                logOutput('INFO', 'MCP: Sent connection notification to Neuro');
            }
        } else {
            logOutput('WARN', 'MCP: Neuro client not connected, actions will be registered on next connection');
        }

        return rceActions.length;
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Failed to register actions: ${errorMessage}`);
        return -1;
    }
}

/**
 * Disconnects from the MCP server and unregisters all MCP actions.
 *
 * @returns True if unregistration was successful
 */
export async function unregisterMCPActions(): Promise<boolean> {
    try {
        if (!mcpManager.isConnected) {
            logOutput('INFO', 'MCP: No server connected to unregister');
            return true;
        }

        const actionNames = Object.keys(mcpActions);

        // Send context message to Neuro about disconnection
        if (NEURO.client && NEURO.connected && actionNames.length > 0) {
            const contextMessage = 'The MCP server is now disconnected. You can\'t access the tools whose names start with `mcp_` anymore.';
            NEURO.client.sendContext(contextMessage);
            logOutput('INFO', 'MCP: Sent disconnection notification to Neuro');
        }

        // Unregister from Neuro client
        if (NEURO.client && actionNames.length > 0) {
            NEURO.client.unregisterActions(actionNames);
            logOutput('INFO', `MCP: Unregistered ${actionNames.length} actions from Neuro`);
        }

        // Clear stored actions
        for (const key of actionNames) {
            delete mcpActions[key];
        }

        // Disconnect from server
        await mcpManager.disconnect();

        logOutput('INFO', 'MCP: Successfully unregistered all actions and disconnected');
        return true;
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Failed to unregister actions: ${errorMessage}`);
        return false;
    }
}

/**
 * Refreshes the list of available MCP tools and updates registered actions.
 * Useful when the MCP server's capabilities change.
 *
 * @returns Number of tools registered, or -1 on failure
 */
export async function refreshMCPActions(): Promise<number> {
    try {
        if (!mcpManager.isConnected) {
            logOutput('ERROR', 'MCP: Cannot refresh - not connected to any server');
            return -1;
        }

        logOutput('INFO', 'MCP: Refreshing tools from server');

        // Get current config for re-registration
        const config = mcpManager.serverConfig;
        if (!config) {
            logOutput('ERROR', 'MCP: No server config available');
            return -1;
        }

        // Unregister old actions and reconnect
        await unregisterMCPActions();
        return await registerMCPActions(config);
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Failed to refresh actions: ${errorMessage}`);
        return -1;
    }
}

/**
 * Creates an RCEAction wrapper for an MCP tool.
 * The action will require user confirmation (Copilot mode) for all executions.
 *
 * @param neuroAction - The Neuro action metadata from translation
 * @returns RCEAction ready for registration
 */
function createMCPAction(neuroAction: NeuroAction): RCEAction {
    return {
        name: neuroAction.name,
        description: neuroAction.description,
        schema: neuroAction.schema,
        permissions: [PERMISSIONS.mcpTools],
        validators: [
            // Validate that server is still connected
            async (actionData: ActionData) => {
                if (!mcpManager.isConnected) {
                    return {
                        success: false,
                        retry: true,
                        message: 'MCP server is not connected',
                    };
                }

                // Validate that this action is still registered
                if (!mcpManager.isMCPAction(actionData.name)) {
                    return {
                        success: false,
                        retry: false,
                        message: `MCP tool "${actionData.name}" is not available`,
                    };
                }

                return { success: true };
            },
        ],
        handler: (actionData: ActionData) => handleMCPToolCall(actionData),
        promptGenerator: (actionData: ActionData) => {
            const mcpToolName = mcpManager.getMCPToolName(actionData.name);
            const toolName = mcpToolName || actionData.name;

            // Create a user-friendly prompt
            if (actionData.params && Object.keys(actionData.params).length > 0) {
                const paramsStr = JSON.stringify(actionData.params, null, 2);
                return `execute MCP tool "${toolName}" with parameters:\n${paramsStr}`;
            } else {
                return `execute MCP tool "${toolName}"`;
            }
        },
        defaultPermission: PermissionLevel.COPILOT, // Always require confirmation
    };
}

/**
 * Handles execution of an MCP tool call from Neuro.
 *
 * @param actionData - The action data from Neuro
 * @returns Result message to send back to Neuro
 */
function handleMCPToolCall(actionData: ActionData): string | undefined {
    // This is a synchronous wrapper - we'll handle async in the background
    // and return a message immediately

    const mcpToolName = mcpManager.getMCPToolName(actionData.name);
    if (!mcpToolName) {
        return `Error: Unknown MCP tool "${actionData.name}"`;
    }

    // Execute the tool call asynchronously
    executeMCPTool(actionData.name, actionData.params, actionData.id)
        .catch(erm => {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            logOutput('ERROR', `MCP: Tool execution failed: ${errorMessage}`);
        });

    // Return undefined to indicate async execution
    // The result will be sent via sendActionResult
    return undefined;
}

/**
 * Executes an MCP tool asynchronously and sends the result to Neuro.
 *
 * @param actionName - The Neuro action name
 * @param params - Tool parameters
 * @param actionId - The action ID for sending results
 */
async function executeMCPTool(
    actionName: string,
    params: Record<string, unknown> | undefined,
    actionId: string,
): Promise<void> {
    try {
        logOutput('DEBUG', `MCP: Executing tool "${actionName}"`);

        const result = await mcpManager.callTool(actionName, params);

        // Send result back to Neuro
        if (NEURO.client) {
            NEURO.client.sendActionResult(actionId, result.success, result.result);

            if (result.success) {
                logOutput('DEBUG', `MCP: Tool "${actionName}" completed successfully`);
            } else {
                logOutput('WARN', `MCP: Tool "${actionName}" failed: ${result.result}`);
            }
        }
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Unexpected error executing tool: ${errorMessage}`);

        if (NEURO.client) {
            NEURO.client.sendActionResult(actionId, false, `Tool execution failed: ${errorMessage}`);
        }
    }
}

/**
 * Gets the current MCP connection status and statistics.
 *
 * @returns Object with connection info
 */
export function getMCPStatus() {
    return {
        connected: mcpManager.isConnected,
        serverUrl: mcpManager.serverConfig?.url || null,
        toolCount: mcpManager.toolCount,
        registeredActions: mcpManager.registeredActions,
    };
}

/**
 * Checks if an action name corresponds to an MCP tool.
 *
 * @param actionName - The action name to check
 * @returns True if this is an MCP action
 */
export function isMCPAction(actionName: string): boolean {
    return actionName in mcpActions;
}

/**
 * Gets an MCP action by its Neuro action name.
 *
 * @param actionName - The Neuro action name
 * @returns The RCEAction object, or undefined if not found
 */
export function getMCPAction(actionName: string): RCEAction | undefined {
    return mcpActions[actionName];
}

/**
 * Auto-connects to MCP server if configured.
 * Should be called when Neuro client connects.
 * Checks permission level, MCP.autoConnect, and MCP.serverUrl before connecting.
 */
export async function autoConnectMCP(): Promise<void> {
    const permissionLevel = getPermissionLevel(PERMISSIONS.mcpTools);
    if (permissionLevel === PermissionLevel.OFF) {
        logOutput('DEBUG', 'MCP: Auto-connect skipped (permission is Off)');
        return;
    }

    if (!MCP.autoConnect) {
        logOutput('DEBUG', 'MCP: Auto-connect skipped (autoConnect is false)');
        return;
    }

    if (!MCP.serverUrl) {
        logOutput('WARN', 'MCP: Auto-connect skipped (serverUrl not configured)');
        return;
    }

    logOutput('INFO', 'MCP: Auto-connecting to server...');

    try {
        const config = {
            url: MCP.serverUrl,
            timeout: MCP.timeout,
        };

        const toolCount = await registerMCPActions(config);

        if (toolCount > 0) {
            logOutput('INFO', `MCP: Auto-connected and registered ${toolCount} tools`);
        } else if (toolCount === 0) {
            logOutput('WARN', 'MCP: Auto-connected but no tools available');
        } else {
            logOutput('ERROR', 'MCP: Auto-connect failed');
        }
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Auto-connect failed: ${errorMessage}`);
    }
}

/**
 * MCP Actions integration for NeuroPilot.
 *
 * This module handles:
 * - Registration/unregistration of MCP tools as Neuro actions
 * - Execution of MCP tools when called by Neuro
 * - Safety validation and confirmation dialogs (Copilot mode)
 */

import * as vscode from 'vscode';
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
 * Set of enabled MCP tool names.
 * Tools not in this set will not be registered with Neuro.
 * Resets on each new connection (in-memory only, not persisted).
 */
const enabledMCPTools = new Set<string>();

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

        // Store all actions for later reference
        for (const action of rceActions) {
            mcpActions[action.name] = action;
        }

        // Filter only enabled tools (initially none, user must configure)
        const toolsToRegister = rceActions.filter(a =>
            enabledMCPTools.has(a.name) && isActionEnabled(a),
        );

        // Register with Neuro client
        if (NEURO.client && NEURO.connected) {
            if (toolsToRegister.length > 0) {
                NEURO.client.registerActions(stripToActions(toolsToRegister));
                logOutput('INFO', `MCP: Registered ${toolsToRegister.length} tools as Neuro actions`);
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

        // Unregister from Neuro client first
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
 * Gets information about all available MCP tools.
 * Used for the tool configuration UI.
 *
 * @returns Array of tool info objects with name, description, and enabled status
 */
export function getAllMCPTools(): { name: string; description: string; enabled: boolean }[] {
    return Object.values(mcpActions).map(action => ({
        name: action.name,
        description: action.description || '',
        enabled: enabledMCPTools.has(action.name),
    }));
}

/**
 * Clears all enabled MCP tools.
 * Called when establishing a new connection to start with all tools disabled.
 */
export function clearEnabledMCPTools(): void {
    enabledMCPTools.clear();
    logOutput('DEBUG', 'MCP: Cleared enabled tools list');
}

/**
 * Sets which MCP tools are enabled.
 * This updates the in-memory enabled tools set and triggers a refresh.
 *
 * @param toolNames - Array of tool names to enable
 */
export async function setEnabledMCPTools(toolNames: string[]): Promise<void> {
    enabledMCPTools.clear();
    for (const name of toolNames) {
        if (name in mcpActions) {
            enabledMCPTools.add(name);
        }
    }
    logOutput('INFO', `MCP: Updated enabled tools: ${toolNames.length} enabled`);
}

/**
 * Shows a checkbox dialog to configure which MCP tools are enabled.
 */
export async function configureMCPTools(): Promise<void> {
    if (!mcpManager.isConnected) {
        vscode.window.showWarningMessage('No MCP server connected. Connect to a server first.');
        return;
    }

    const allTools = getAllMCPTools();
    if (allTools.length === 0) {
        vscode.window.showInformationMessage('No MCP tools available.');
        return;
    }

    // Store previous enabled tools for diff calculation
    const previouslyEnabled = new Set(enabledMCPTools);

    // Create quick pick items with current enabled status
    const items = allTools.map(tool => ({
        label: tool.name,
        description: tool.description || '(no description)',
        picked: tool.enabled,
    }));

    // Show multi-select quick pick
    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: `Select tools to enable (${allTools.length} available)`,
        title: 'Configure MCP Tools',
    });

    if (selected === undefined) {
        return; // User cancelled
    }

    // Calculate new enabled set
    const newEnabled = new Set(selected.map(item => item.label));

    // Calculate diff
    const added = [...newEnabled].filter(name => !previouslyEnabled.has(name));
    const removed = [...previouslyEnabled].filter(name => !newEnabled.has(name));

    // If no changes, just return
    if (added.length === 0 && removed.length === 0) {
        vscode.window.showInformationMessage('No changes made to MCP tool configuration.');
        return;
    }

    // Update the enabled set
    await setEnabledMCPTools([...newEnabled]);

    // Selectively register/unregister based on diff
    if (NEURO.client && NEURO.connected) {
        // First register newly added tools
        const availableList = [...newEnabled].join(', ');
        if (added.length > 0) {
            const actionsToRegister = added.map(name => mcpActions[name]).filter(a => a && isActionEnabled(a));

            NEURO.client.registerActions(stripToActions(actionsToRegister));
            NEURO.client.sendContext(`${added.length} new MCP tool${added.length === 1 ? '' : 's'} added: ${added.join(', ')}`);

            logOutput('INFO', `MCP: Registered ${actionsToRegister.length} new tool(s) with Neuro`);
        }

        // Then unregister removed tools
        if (removed.length > 0) {
            NEURO.client.unregisterActions(removed);
            NEURO.client.sendContext( `${removed.length} MCP tool${removed.length === 1 ? '' : 's'} removed: ${removed.join(', ')}.`);

            logOutput('INFO', `MCP: Unregistering ${removed.length} tool(s) from Neuro`);
        }

        // Also remind Neuro what tools are still available
        NEURO.client.sendContext(`${availableList === '' ? 'No MCP available tools from now on.' : `Currently available MCP tools: ${availableList}`}`);
        logOutput('INFO', 'MCP: Notified Neuro about remaining available tools');
    }

    // Show result
    vscode.window.showInformationMessage(
        `MCP tools configured: ${newEnabled.size} enabled, ${allTools.length - newEnabled.size} disabled. (${added.length} added, ${removed.length} removed)`,
    );
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
            maxResultLength: MCP.maxResultLength,
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

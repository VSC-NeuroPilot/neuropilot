/**
 * VSCode commands for MCP server management.
 *
 * Provides GUI commands for:
 * - Connecting to MCP servers
 * - Disconnecting from servers
 * - Refreshing tool lists
 * - Viewing connection status
 */

import * as vscode from 'vscode';
import { registerMCPActions, unregisterMCPActions, refreshMCPActions, getMCPStatus, configureMCPTools, clearEnabledMCPTools } from './mcp_actions';
import { MCP, PERMISSIONS, getPermissionLevel, PermissionLevel } from '../config';
import { logOutput } from '../utils';

/**
 * Connects to the configured MCP server.
 * Uses settings from neuropilot.mcp.serverUrl and neuropilot.mcp.timeout.
 */
async function connectToMCPServer(): Promise<void> {
    try {
        // Check if already connected
        const status = getMCPStatus();
        if (status.connected) {
            vscode.window.showWarningMessage(
                `MCP: Already connected to ${status.serverUrl}. Disconnect first before connecting to a new server.`,
            );
            return;
        }

        // Check if MCP permission is enabled
        const permissionLevel = getPermissionLevel(PERMISSIONS.mcpTools);
        if (permissionLevel === PermissionLevel.OFF) {
            const enable = await vscode.window.showWarningMessage(
                'MCP tools permission is set to "Off". Would you like to enable it?',
                'Enable (Copilot)', 'Enable (Autopilot)', 'Cancel',
            );

            if (enable === 'Enable (Copilot)' || enable === 'Enable (Autopilot)') {
                const scope = await vscode.window.showQuickPick(
                    ['this entire workspace', 'this user'],
                    { title: 'Enable MCP tools permission for...' },
                );

                if (!scope) {
                    return;
                }

                const permissionValue = enable === 'Enable (Copilot)' ? 'Copilot' : 'Autopilot';
                const configTarget = scope === 'this entire workspace'
                    ? vscode.ConfigurationTarget.Workspace
                    : vscode.ConfigurationTarget.Global;

                await vscode.workspace.getConfiguration('neuropilot').update('permission.mcpTools', permissionValue, configTarget);
            } else {
                return;
            }
        }

        // Check if server URL is configured
        const serverUrl = MCP.serverUrl;
        if (!serverUrl) {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter the MCP server URL',
                placeHolder: 'http://localhost:3000',
                validateInput: (value) => {
                    if (!value) return 'URL is required';
                    try {
                        new URL(value);
                        return null;
                    } catch {
                        return 'Invalid URL format';
                    }
                },
            });

            if (!url) return;

            // Ask user where to save the URL
            const scope = await vscode.window.showQuickPick(
                ['this entire workspace', 'this user'],
                { title: 'Save MCP server URL for...' },
            );

            if (!scope) return;

            const configTarget = scope === 'this entire workspace'
                ? vscode.ConfigurationTarget.Workspace
                : vscode.ConfigurationTarget.Global;

            // Save the URL
            await vscode.workspace.getConfiguration('neuropilot').update('mcp.serverUrl', url, configTarget);
        }

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'MCP: Connecting to server...',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Establishing connection...' });

                const config = {
                    url: MCP.serverUrl,
                    timeout: MCP.timeout,
                };

                // Clear enabled tools for new connection (all disabled by default)
                clearEnabledMCPTools();

                const toolCount = await registerMCPActions(config);

                if (toolCount > 0) {
                    progress.report({ message: `Connected! Found ${toolCount} tools.` });
                    vscode.window.showInformationMessage(
                        `MCP: Connected to server with ${toolCount} tool${toolCount === 1 ? '' : 's'}. All tools are disabled by default.`,
                        'Configure Tools',
                    ).then(selection => {
                        if (selection === 'Configure Tools') {
                            vscode.commands.executeCommand('neuropilot.mcp.configureTools');
                        }
                    });
                } else if (toolCount === 0) {
                    vscode.window.showWarningMessage(
                        `MCP: Connected to ${config.url}, but no tools are available.`,
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `MCP: Failed to connect to ${config.url}. Check the output panel for details.`,
                    );
                }
            },
        );
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Connection command failed: ${errorMessage}`);
        vscode.window.showErrorMessage(`MCP: Connection failed: ${errorMessage}`);
    }
}

/**
 * Disconnects from the current MCP server.
 */
async function disconnectFromMCPServer(): Promise<void> {
    try {
        const status = getMCPStatus();

        if (!status.connected) {
            vscode.window.showInformationMessage('MCP: No server is currently connected.');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'MCP: Disconnecting from server...',
                cancellable: false,
            },
            async () => {
                const success = await unregisterMCPActions();

                if (success) {
                    vscode.window.showInformationMessage(
                        `MCP: Disconnected from server and unregistered ${status.toolCount} tools.`,
                    );
                } else {
                    vscode.window.showErrorMessage(
                        'MCP: Failed to disconnect cleanly. Check the output panel for details.',
                    );
                }
            },
        );
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Disconnect command failed: ${errorMessage}`);
        vscode.window.showErrorMessage(`MCP: Disconnect failed: ${errorMessage}`);
    }
}

/**
 * Refreshes the list of available tools from the MCP server.
 */
async function refreshMCPTools(): Promise<void> {
    try {
        const status = getMCPStatus();

        if (!status.connected) {
            vscode.window.showWarningMessage(
                'MCP: No server is currently connected. Use "Connect to MCP Server" first.',
            );
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'MCP: Refreshing tools...',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Fetching updated tool list...' });

                const toolCount = await refreshMCPActions();

                if (toolCount > 0) {
                    progress.report({ message: `Refreshed! Registered ${toolCount} tools.` });
                    vscode.window.showInformationMessage(
                        `MCP: Refreshed tool list. Now registered ${toolCount} tools.`,
                    );
                } else if (toolCount === 0) {
                    vscode.window.showWarningMessage('MCP: No tools are available on the server.');
                } else {
                    vscode.window.showErrorMessage(
                        'MCP: Failed to refresh tools. Check the output panel for details.',
                    );
                }
            },
        );
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Refresh command failed: ${errorMessage}`);
        vscode.window.showErrorMessage(`MCP: Refresh failed: ${errorMessage}`);
    }
}

/**
 * Shows the current MCP connection status.
 */
async function showMCPStatus(): Promise<void> {
    try {
        const status = getMCPStatus();

        if (!status.connected) {
            vscode.window.showInformationMessage(
                'MCP Status: Not connected to any server.\n\n' +
                'Use "Connect to MCP Server" to establish a connection.',
            );
            return;
        }

        const toolList = status.registeredActions.length > 0
            ? `\n\nRegistered tools:\n• ${status.registeredActions.join('\n• ')}`
            : '\n\nNo tools are currently registered.';

        vscode.window.showInformationMessage(
            'MCP Status: Connected\n\n' +
            `Server: ${status.serverUrl}\n` +
            `Tools: ${status.toolCount}${toolList}`,
        );
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Status command failed: ${errorMessage}`);
        vscode.window.showErrorMessage(`MCP: Failed to get status: ${errorMessage}`);
    }
}

/**
 * Test command to manually invoke an MCP tool (for debugging).
 */
async function testMCPToolCall(): Promise<void> {
    try {
        const status = getMCPStatus();

        if (!status.connected) {
            vscode.window.showWarningMessage(
                'MCP: No server is currently connected. Use "Connect to MCP Server" first.',
            );
            return;
        }

        if (status.registeredActions.length === 0) {
            vscode.window.showWarningMessage('MCP: No tools are available to test.');
            return;
        }

        // Show quick pick to select a tool
        const selectedTool = await vscode.window.showQuickPick(status.registeredActions, {
            placeHolder: 'Select an MCP tool to invoke',
            title: 'Test MCP Tool Call',
        });

        if (!selectedTool) return;

        // Ask for parameters (JSON format)
        const paramsInput = await vscode.window.showInputBox({
            prompt: 'Enter parameters as JSON (or leave empty for no parameters)',
            placeHolder: '{"param1": "value1", "param2": "value2"}',
            value: '{}',
            validateInput: (value) => {
                if (!value || value.trim() === '') return null;
                try {
                    JSON.parse(value);
                    return null;
                } catch {
                    return 'Invalid JSON format';
                }
            },
        });

        if (paramsInput === undefined) return;

        const params = paramsInput.trim() ? JSON.parse(paramsInput) : undefined;

        // Show progress while calling the tool
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `MCP: Calling tool "${selectedTool}"...`,
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Executing tool...' });

                // Import mcpManager here to avoid circular dependency issues
                const { mcpManager } = await import('./mcp_actions.js');
                const result = await mcpManager.callTool(selectedTool, params);

                if (result.success) {
                    logOutput('INFO', `MCP Test: Tool "${selectedTool}" succeeded: ${result.result}`);
                    vscode.window.showInformationMessage(
                        `MCP Tool Success!\n\nTool: ${selectedTool}\nResult: ${result.result}`,
                        { modal: false },
                    );
                } else {
                    logOutput('ERROR', `MCP Test: Tool "${selectedTool}" failed: ${result.result}`);
                    vscode.window.showErrorMessage(
                        `MCP Tool Failed!\n\nTool: ${selectedTool}\nError: ${result.result}`,
                    );
                }
            },
        );
    } catch (erm) {
        const errorMessage = erm instanceof Error ? erm.message : String(erm);
        logOutput('ERROR', `MCP: Test tool call failed: ${errorMessage}`);
        vscode.window.showErrorMessage(`MCP: Test failed: ${errorMessage}`);
    }
}

/**
 * Registers all MCP commands with VSCode.
 * Should be called during extension activation.
 *
 * @returns Array of disposables for cleanup
 */
export function registerMCPCommands(): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('neuropilot.mcp.connectServer', connectToMCPServer),
        vscode.commands.registerCommand('neuropilot.mcp.disconnectServer', disconnectFromMCPServer),
        vscode.commands.registerCommand('neuropilot.mcp.refreshTools', refreshMCPTools),
        vscode.commands.registerCommand('neuropilot.mcp.showStatus', showMCPStatus),
        vscode.commands.registerCommand('neuropilot.mcp.configureTools', configureMCPTools),
        vscode.commands.registerCommand('neuropilot.mcp.testToolCall', testMCPToolCall),
    ];
}

# Overview for MCP Integration

### MCP Support Status (What can be done now)

- MCP tools are translated to Neuro actions.

- Neuro can now call tools from single MCP server

- You can manually connect/re-connect to MCP servers

- Three modes `Off`, `Copilot` and `Autopilot` for all MCP tools

- Enable/Disable MCP service

## Limitations

- Test suite not updated, still using same test code from `upstream/dev` (because this test requires a mock MCP server within the test suite, not imeplemted yet)

## MCP Integration Overview

### How It Works

The MCP integration creates a translation layer between the Model Context Protocol and NeuroPilot's custom Neuro API. Here's the flow:

```
MCP Server -> MCPManager -> RCEAction wrappers -> Neuro API -> Neuro AI
                                                                 |
                                  VSCode <- Tool Execution <- RCEActionHandler
```

1. **Connection**: Extension connects to an MCP server (HTTP/SSE endpoint)
2. **Discovery**: MCPClient queries available tools via `tools/list`
3. **Translation**: Each MCP tool is translated to a Neuro action with:
   - Sanitized name (e.g., `mcp__fetch_url` -> `mcp_fetch_url`)
   - JSON schema from MCP tool's `inputSchema`
   - Permission requirement: `mcpTools`
   - Default permission level: `Copilot` 
4. **Registration**: Actions are registered with the Neuro client
5. **Execution**: When Neuro calls an MCP tool:
   - RCEActionHandler identifies it as an MCP action
   - Validates permissions and schema
   - Shows confirmation dialog (Copilot mode) or executes directly (Autopilot mode)
   - MCPManager forwards the call to the MCP server via `tools/call`
   - Result is sent back to Neuro

### Changed Files

#### New Files (src/mcp/)

- **`mcp_manager.ts`**: Manages single MCP server connection, tool discovery, and execution routing
- **`mcp_actions.ts`**: Handles registration/unregistration of MCP tools as Neuro actions, manages `mcpActions` registry
- **`mcp_commands.ts`**: VSCode commands for user interaction (connect, disconnect, refresh, status, test)

- **`mcp_client.ts`**: Low-level HTTP client for MCP protocol communication
- **`translation.ts`**: Converts MCP tool schemas to Neuro action format (modified to handle edge cases)
- **`registry.ts`**: Maps sanitized Neuro action names to original MCP tool names (enhanced)
- **`index.ts`**: Module exports (updated)

#### Integration Points

- **`src/rce.ts`**: Modified `RCEActionHandler` to check for and execute MCP actions
  - Added `isMCPAction()` check in action lookup
  - Added branch to retrieve MCP actions from `mcpActions` registry
- **`src/config.ts`**: Added MCP configuration class with settings:
  - `mcp.enabled`: Enable/disable MCP integration
  - `mcp.serverUrl`: MCP server endpoint
  - `mcp.timeout`: Connection timeout
  - `mcp.autoConnect`: Auto-connect on Neuro client connection
  - New permission: `mcpTools` for MCP tool execution
- **`src/desktop/extension.ts`**: Extension activation registers MCP commands and auto-connect
- **`package.json`**: Added 5 new commands and 4 configuration settings

### Configuration

Users can configure MCP in VSCode settings:

```json
{
  "neuropilot.mcp.enabled": false,
  "neuropilot.mcp.serverUrl": "http://localhost:3000",
  "neuropilot.mcp.timeout": 30000,
  "neuropilot.mcp.autoConnect": true
}
```

Permission level for MCP tools is controlled via:

```json
{
  "neuropilot.permission.mcpTools": "copilot" // or "autopilot" or "off"
}
```

### User Commands

Available via Command Palette (Ctrl+Shift+P):

- **NeuroPilot MCP: Connect to MCP Server** - Connect to configured server
- **NeuroPilot MCP: Disconnect from MCP Server** - Disconnect and unregister tools
- **NeuroPilot MCP: Refresh MCP Tools** - Re-fetch tools from server
- **NeuroPilot MCP: Show MCP Status** - Display connection info and registered tools
- **NeuroPilot MCP: Test MCP Tool Call (Debug)** - Manually invoke a tool for debugging

### Testing

To test the integration:

1. Start an MCP server
2. Configure MCP server URL in extention settings
3. `Ctrl+Shift+P`, then find&execute "NeuroPilot MCP: Connect to MCP Server" command
4. Use "NeuroPilot MCP: Test MCP Tool Call (Debug)" command to verify direct communication between extension and MCP server
5. Try invoke mcp tools from test Neuro server

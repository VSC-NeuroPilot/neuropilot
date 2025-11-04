/**
 * Unit tests for MCP Client.
 * Tests connection, tool discovery, and tool execution.
 */

import * as assert from 'assert';
import { MCPClient } from '../../mcp';

suite('MCPClient Tests', () => {
    suite('Constructor and Basic Properties', () => {
        test('Creates client with default timeout', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            assert.strictEqual(client.isConnected, false);
            assert.strictEqual(client.availableTools.length, 0);
        });

        test('Creates client with custom timeout', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
                timeout: 5000,
            });

            assert.strictEqual(client.isConnected, false);
        });

        test('toString returns formatted string', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            const str = client.toString();

            assert.ok(str.includes('MCPClient'));
            assert.ok(str.includes('http://127.0.0.1:3000'));
            assert.ok(str.includes('connected: false'));
            assert.ok(str.includes('tools: 0'));
        });
    });

    suite('Connection State', () => {
        test('isConnected is false initially', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            assert.strictEqual(client.isConnected, false);
        });

        test('availableTools is empty initially', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            assert.strictEqual(client.availableTools.length, 0);
            assert.ok(Array.isArray(client.availableTools));
        });
    });

    suite('Tool Lookup', () => {
        test('findTool returns undefined when no tools available', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            const tool = client.findTool('nonexistent');

            assert.strictEqual(tool, undefined);
        });

        test('hasTool returns false when no tools available', () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            assert.strictEqual(client.hasTool('nonexistent'), false);
        });
    });

    suite('Error Handling', () => {
        test('refreshCapabilities throws when not connected', async () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            await assert.rejects(
                async () => await client.refreshCapabilities(),
                /not connected/i,
            );
        });

        test('callTool returns failure when not connected', async () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            const result = await client.callTool('test_tool', {});

            assert.strictEqual(result.success, false);
            assert.ok(result.result.includes('not connected'));
        });

        test('checkHealth returns false when not connected', async () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            const healthy = await client.checkHealth();

            assert.strictEqual(healthy, false);
        });
    });

    suite('Disconnect', () => {
        test('disconnect does not throw when not connected', async () => {
            const client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });

            // Should not throw
            await client.disconnect();

            assert.strictEqual(client.isConnected, false);
        });
    });

    // Integration tests with mock server (requires mock server to be running)
    // Uncomment when testing with a running mock MCP server
    suite('Integration with Mock Server', function() {
        // Increase timeout for network operations
        this.timeout(10000);

        let client: MCPClient;

        setup(() => {
            client = new MCPClient({
                url: 'http://127.0.0.1:3000',
            });
        });

        teardown(async () => {
            if (client.isConnected) {
                await client.disconnect();
            }
        });

        test('connect establishes connection to mock server', async () => {
            await client.connect();

            assert.strictEqual(client.isConnected, true);
        });

        test('refreshCapabilities lists available tools', async () => {
            await client.connect();
            const tools = await client.refreshCapabilities();

            assert.ok(Array.isArray(tools));
            assert.ok(tools.length > 0, 'Mock server should have at least one tool');

            // Check tool structure
            const firstTool = tools[0];
            assert.ok('name' in firstTool);
            assert.ok(typeof firstTool.name === 'string');
        });

        test('findTool finds existing tool after refresh', async () => {
            await client.connect();
            const tools = await client.refreshCapabilities();

            if (tools.length > 0) {
                const toolName = tools[0].name;
                const found = client.findTool(toolName);

                assert.ok(found);
                assert.strictEqual(found.name, toolName);
            }
        });

        test('hasTool returns true for existing tool', async () => {
            await client.connect();
            const tools = await client.refreshCapabilities();

            if (tools.length > 0) {
                const toolName = tools[0].name;
                assert.strictEqual(client.hasTool(toolName), true);
            }
        });

        test('hasTool returns false for non-existing tool', async () => {
            await client.connect();
            await client.refreshCapabilities();

            assert.strictEqual(client.hasTool('nonexistent_tool_xyz'), false);
        });

        test('callTool executes a tool successfully', async () => {
            await client.connect();
            const tools = await client.refreshCapabilities();

            if (tools.length > 0) {
                const toolName = tools[0].name;
                const result = await client.callTool(toolName, {});

                assert.strictEqual(result.success, true);
                assert.ok(typeof result.result === 'string');
            }
        });

        test('checkHealth returns true when connected', async () => {
            await client.connect();

            const healthy = await client.checkHealth();

            assert.strictEqual(healthy, true);
        });

        test('disconnect closes connection', async () => {
            await client.connect();
            assert.strictEqual(client.isConnected, true);

            await client.disconnect();

            assert.strictEqual(client.isConnected, false);
            assert.strictEqual(client.availableTools.length, 0);
        });

        test('connect is idempotent (calling twice does not throw)', async () => {
            await client.connect();
            await client.connect(); // Should not throw

            assert.strictEqual(client.isConnected, true);
        });
    });
});

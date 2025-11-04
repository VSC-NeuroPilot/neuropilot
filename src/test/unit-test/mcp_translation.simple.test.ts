/**
 * Unit tests for MCP translation module.
 * Tests name sanitization, schema simplification, data parsing, and tool registry.
 */

import * as assert from 'assert';
import type { JSONSchema7 } from 'json-schema';
import {
    sanitizeActionName,
    simplifySchema,
    parseActionData,
    mcpToolToNeuroAction,
    FORBIDDEN_SCHEMA_KEYS,
    ToolRegistry,
} from '../../mcp';

suite('MCP Translation Tests', () => {
    suite('sanitizeActionName', () => {
        test('Converts uppercase to lowercase', () => {
            assert.strictEqual(sanitizeActionName('GetFileContent'), 'getfilecontent');
            assert.strictEqual(sanitizeActionName('UPPERCASE'), 'uppercase');
            assert.strictEqual(sanitizeActionName('MixedCase'), 'mixedcase');
        });

        test('Replaces invalid characters with underscore', () => {
            assert.strictEqual(sanitizeActionName('tool-name'), 'tool-name'); // hyphen is valid
            assert.strictEqual(sanitizeActionName('tool.name'), 'tool_name');
            assert.strictEqual(sanitizeActionName('tool::name'), 'tool_name'); // consecutive underscores removed
            assert.strictEqual(sanitizeActionName('tool name!'), 'tool_name');
            assert.strictEqual(sanitizeActionName('MCP::Tool-Name!'), 'mcp_tool-name');
        });

        test('Removes consecutive underscores', () => {
            assert.strictEqual(sanitizeActionName('tool___name'), 'tool_name');
            assert.strictEqual(sanitizeActionName('multiple____underscores'), 'multiple_underscores');
            assert.strictEqual(sanitizeActionName('a___b___c'), 'a_b_c');
        });

        test('Strips leading and trailing underscores', () => {
            assert.strictEqual(sanitizeActionName('_tool_name'), 'tool_name');
            assert.strictEqual(sanitizeActionName('tool_name_'), 'tool_name');
            assert.strictEqual(sanitizeActionName('__tool_name__'), 'tool_name');
            assert.strictEqual(sanitizeActionName('___leading'), 'leading');
            assert.strictEqual(sanitizeActionName('trailing___'), 'trailing');
        });

        test('Handles edge cases', () => {
            assert.strictEqual(sanitizeActionName(''), 'unnamed_action');
            assert.strictEqual(sanitizeActionName('___'), 'unnamed_action');
            assert.strictEqual(sanitizeActionName('!!!'), 'unnamed_action');
            assert.strictEqual(sanitizeActionName('123'), '123');
            assert.strictEqual(sanitizeActionName('valid_name'), 'valid_name');
            assert.strictEqual(sanitizeActionName('already-valid-123'), 'already-valid-123');
        });

        test('Preserves valid characters', () => {
            assert.strictEqual(sanitizeActionName('valid_action_name'), 'valid_action_name');
            assert.strictEqual(sanitizeActionName('action-with-hyphens'), 'action-with-hyphens');
            assert.strictEqual(sanitizeActionName('action_123'), 'action_123');
            assert.strictEqual(sanitizeActionName('a1b2c3'), 'a1b2c3');
        });
    });

    suite('simplifySchema', () => {
        test('Returns default schema for null/undefined', () => {
            assert.deepStrictEqual(simplifySchema(null), { type: 'object' });
            assert.deepStrictEqual(simplifySchema(undefined), { type: 'object' });
        });

        test('Preserves basic type schemas', () => {
            assert.deepStrictEqual(
                simplifySchema({ type: 'string' }),
                { type: 'string' },
            );

            assert.deepStrictEqual(
                simplifySchema({ type: 'number' }),
                { type: 'number' },
            );

            assert.deepStrictEqual(
                simplifySchema({ type: 'boolean' }),
                { type: 'boolean' },
            );
        });

        test('Removes forbidden schema keys', () => {
            const schema = {
                type: 'object' as const,
                properties: { name: { type: 'string' as const } },
                additionalProperties: false,
                description: 'A test object',
                title: 'TestObject',
                deprecated: true,
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'object',
                properties: { name: { type: 'string' } },
            });

            // Verify forbidden keys are removed
            assert.ok(!('additionalProperties' in result));
            assert.ok(!('description' in result));
            assert.ok(!('title' in result));
            assert.ok(!('deprecated' in result));
        });

        test('Removes $ref and other $ keywords', () => {
            const schema = {
                type: 'object' as const,
                $id: 'https://example.com/schema',
                $schema: 'http://json-schema.org/draft-07/schema#',
                $ref: '#/definitions/Thing',
                $defs: { Thing: { type: 'string' as const } },
                properties: { value: { type: 'string' as const } },
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'object',
                properties: { value: { type: 'string' } },
            });
        });

        test('Handles anyOf by taking first option', () => {
            const schema = {
                anyOf: [
                    { type: 'string' as const },
                    { type: 'number' as const },
                ],
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, { type: 'string' });
        });

        test('Handles oneOf by taking first option', () => {
            const schema = {
                oneOf: [
                    { type: 'number' as const, minimum: 0 },
                    { type: 'string' as const },
                ],
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, { type: 'number', minimum: 0 });
        });

        test('Handles allOf by taking first option', () => {
            const schema = {
                allOf: [
                    { type: 'object' as const, properties: { a: { type: 'string' as const } } },
                    { type: 'object' as const, properties: { b: { type: 'number' as const } } },
                ],
            } as JSONSchema7;

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'object',
                properties: { a: { type: 'string' } },
            });
        });

        test('Recursively processes nested objects', () => {
            const schema = {
                type: 'object' as const,
                description: 'Top level',
                properties: {
                    nested: {
                        type: 'object' as const,
                        title: 'Nested object',
                        properties: {
                            value: {
                                type: 'string' as const,
                                description: 'A value',
                            },
                        },
                        additionalProperties: false,
                    },
                },
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'object',
                properties: {
                    nested: {
                        type: 'object',
                        properties: {
                            value: {
                                type: 'string',
                            },
                        },
                    },
                },
            });
        });

        test('Processes arrays in schema', () => {
            const schema = {
                type: 'array' as const,
                items: {
                    type: 'object' as const,
                    description: 'Array item',
                    properties: {
                        name: { type: 'string' as const, title: 'Name' },
                    },
                },
                minItems: 1,
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
                minItems: 1,
            });
        });

        test('Preserves allowed constraints', () => {
            const schema = {
                type: 'object' as const,
                properties: {
                    name: {
                        type: 'string' as const,
                        minLength: 1,
                        maxLength: 100,
                        pattern: '^[a-z]+$',
                    },
                    age: {
                        type: 'number' as const,
                        minimum: 0,
                        maximum: 150,
                    },
                    tags: {
                        type: 'array' as const,
                        items: { type: 'string' as const },
                        minItems: 1,
                        maxItems: 10,
                        uniqueItems: true,
                    },
                },
                required: ['name'],
            };

            const result = simplifySchema(schema);

            assert.deepStrictEqual(result, {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 100,
                        pattern: '^[a-z]+$',
                    },
                    age: {
                        type: 'number',
                        minimum: 0,
                        maximum: 150,
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 1,
                        maxItems: 10,
                        uniqueItems: true,
                    },
                },
                required: ['name'],
            });
        });

        test('Verifies FORBIDDEN_SCHEMA_KEYS set contains expected keys', () => {
            // Ensure critical keywords are in the forbidden set
            const criticalKeys = [
                '$ref', '$schema', '$id',
                'additionalProperties', 'anyOf', 'oneOf', 'allOf',
                'description', 'title',
            ];

            for (const key of criticalKeys) {
                assert.ok(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    FORBIDDEN_SCHEMA_KEYS.has(key as any),
                    `Expected "${key}" to be in FORBIDDEN_SCHEMA_KEYS`,
                );
            }
        });
    });

    suite('parseActionData', () => {
        test('Parses valid JSON object', () => {
            const data = '{"path": "/tmp/file.txt", "mode": "read"}';
            const result = parseActionData(data);

            assert.deepStrictEqual(result, {
                path: '/tmp/file.txt',
                mode: 'read',
            });
        });

        test('Handles null string', () => {
            assert.deepStrictEqual(parseActionData('null'), {});
        });

        test('Handles null value', () => {
            assert.deepStrictEqual(parseActionData(null), {});
        });

        test('Handles undefined value', () => {
            assert.deepStrictEqual(parseActionData(undefined), {});
        });

        test('Handles empty string', () => {
            assert.deepStrictEqual(parseActionData(''), {});
        });

        test('Returns empty object for invalid JSON', () => {
            assert.deepStrictEqual(parseActionData('not valid json'), {});
            assert.deepStrictEqual(parseActionData('{invalid}'), {});
            assert.deepStrictEqual(parseActionData('{"key": }'), {});
        });

        test('Returns empty object for non-object JSON', () => {
            assert.deepStrictEqual(parseActionData('[]'), {});
            assert.deepStrictEqual(parseActionData('["array"]'), {});
            assert.deepStrictEqual(parseActionData('"string"'), {});
            assert.deepStrictEqual(parseActionData('123'), {});
            assert.deepStrictEqual(parseActionData('true'), {});
        });

        test('Handles nested objects', () => {
            const data = '{"config": {"timeout": 1000, "retry": true}}';
            const result = parseActionData(data);

            assert.deepStrictEqual(result, {
                config: {
                    timeout: 1000,
                    retry: true,
                },
            });
        });

        test('Handles empty object', () => {
            const data = '{}';
            const result = parseActionData(data);

            assert.deepStrictEqual(result, {});
        });
    });

    suite('mcpToolToNeuroAction', () => {
        test('Converts complete MCP tool to Neuro action', () => {
            const tool = {
                name: 'GetFileContent',
                description: 'Reads a file from disk',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        path: { type: 'string' as const, description: 'File path' },
                    },
                    required: ['path'],
                    additionalProperties: false,
                },
            };

            const action = mcpToolToNeuroAction(tool);

            assert.strictEqual(action.name, 'getfilecontent');
            assert.strictEqual(action.description, 'Reads a file from disk');
            assert.deepStrictEqual(action.schema, {
                type: 'object',
                properties: {
                    path: { type: 'string' },
                },
                required: ['path'],
            });
        });

        test('Generates default description when missing', () => {
            const tool = {
                name: 'MyTool',
                inputSchema: { type: 'object' as const },
            };

            const action = mcpToolToNeuroAction(tool);

            assert.strictEqual(action.description, 'Execute MyTool');
        });

        test('Uses default schema when inputSchema is missing', () => {
            const tool = {
                name: 'SimpleTool',
                description: 'A simple tool',
            };

            const action = mcpToolToNeuroAction(tool);

            assert.deepStrictEqual(action.schema, { type: 'object' });
        });

        test('Sanitizes tool name correctly', () => {
            const tool = {
                name: 'MCP::Complex-Tool.Name!',
                description: 'A complex tool',
            };

            const action = mcpToolToNeuroAction(tool);

            assert.strictEqual(action.name, 'mcp_complex-tool_name');
        });
    });
});

suite('ToolRegistry Tests', () => {
    let registry: ToolRegistry;

    setup(() => {
        registry = new ToolRegistry();
    });

    suite('register', () => {
        test('Registers a new mapping', () => {
            registry.register('get_file_content', 'GetFileContent');

            assert.strictEqual(registry.getMCPToolName('get_file_content'), 'GetFileContent');
            assert.strictEqual(registry.getNeuroActionName('GetFileContent'), 'get_file_content');
        });

        test('Allows re-registering the same mapping', () => {
            registry.register('action1', 'Tool1');
            registry.register('action1', 'Tool1'); // Same mapping, should not throw

            assert.strictEqual(registry.size, 1);
        });

        test('Throws on conflicting Neuro action mapping', () => {
            registry.register('action1', 'Tool1');

            assert.throws(
                () => registry.register('action1', 'Tool2'),
                /already mapped to MCP tool "Tool1"/,
            );
        });

        test('Throws on conflicting MCP tool mapping', () => {
            registry.register('action1', 'Tool1');

            assert.throws(
                () => registry.register('action2', 'Tool1'),
                /already mapped to Neuro action "action1"/,
            );
        });

        test('Registers multiple different mappings', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');
            registry.register('action3', 'Tool3');

            assert.strictEqual(registry.size, 3);
            assert.strictEqual(registry.getMCPToolName('action1'), 'Tool1');
            assert.strictEqual(registry.getMCPToolName('action2'), 'Tool2');
            assert.strictEqual(registry.getMCPToolName('action3'), 'Tool3');
        });
    });

    suite('getMCPToolName', () => {
        test('Returns MCP tool name for registered action', () => {
            registry.register('action1', 'Tool1');
            assert.strictEqual(registry.getMCPToolName('action1'), 'Tool1');
        });

        test('Returns undefined for unregistered action', () => {
            assert.strictEqual(registry.getMCPToolName('unknown'), undefined);
        });
    });

    suite('getNeuroActionName', () => {
        test('Returns Neuro action name for registered tool', () => {
            registry.register('action1', 'Tool1');
            assert.strictEqual(registry.getNeuroActionName('Tool1'), 'action1');
        });

        test('Returns undefined for unregistered tool', () => {
            assert.strictEqual(registry.getNeuroActionName('UnknownTool'), undefined);
        });
    });

    suite('has methods', () => {
        test('hasNeuroAction returns true for registered actions', () => {
            registry.register('action1', 'Tool1');
            assert.strictEqual(registry.hasNeuroAction('action1'), true);
        });

        test('hasNeuroAction returns false for unregistered actions', () => {
            assert.strictEqual(registry.hasNeuroAction('unknown'), false);
        });

        test('hasMCPTool returns true for registered tools', () => {
            registry.register('action1', 'Tool1');
            assert.strictEqual(registry.hasMCPTool('Tool1'), true);
        });

        test('hasMCPTool returns false for unregistered tools', () => {
            assert.strictEqual(registry.hasMCPTool('UnknownTool'), false);
        });
    });

    suite('unregister methods', () => {
        test('unregisterByNeuroAction removes mapping', () => {
            registry.register('action1', 'Tool1');

            const removed = registry.unregisterByNeuroAction('action1');

            assert.strictEqual(removed, true);
            assert.strictEqual(registry.size, 0);
            assert.strictEqual(registry.getMCPToolName('action1'), undefined);
            assert.strictEqual(registry.getNeuroActionName('Tool1'), undefined);
        });

        test('unregisterByNeuroAction returns false for non-existent action', () => {
            const removed = registry.unregisterByNeuroAction('unknown');
            assert.strictEqual(removed, false);
        });

        test('unregisterByMCPTool removes mapping', () => {
            registry.register('action1', 'Tool1');

            const removed = registry.unregisterByMCPTool('Tool1');

            assert.strictEqual(removed, true);
            assert.strictEqual(registry.size, 0);
        });

        test('unregisterByMCPTool returns false for non-existent tool', () => {
            const removed = registry.unregisterByMCPTool('UnknownTool');
            assert.strictEqual(removed, false);
        });
    });

    suite('clear', () => {
        test('Removes all mappings', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');
            registry.register('action3', 'Tool3');

            registry.clear();

            assert.strictEqual(registry.size, 0);
            assert.deepStrictEqual(registry.getAllNeuroActions(), []);
            assert.deepStrictEqual(registry.getAllMCPTools(), []);
        });
    });

    suite('getAll methods', () => {
        test('getAllNeuroActions returns all action names', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');

            const actions = registry.getAllNeuroActions();

            assert.strictEqual(actions.length, 2);
            assert.ok(actions.includes('action1'));
            assert.ok(actions.includes('action2'));
        });

        test('getAllMCPTools returns all tool names', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');

            const tools = registry.getAllMCPTools();

            assert.strictEqual(tools.length, 2);
            assert.ok(tools.includes('Tool1'));
            assert.ok(tools.includes('Tool2'));
        });

        test('Returns empty arrays for empty registry', () => {
            assert.deepStrictEqual(registry.getAllNeuroActions(), []);
            assert.deepStrictEqual(registry.getAllMCPTools(), []);
        });
    });

    suite('size', () => {
        test('Returns 0 for empty registry', () => {
            assert.strictEqual(registry.size, 0);
        });

        test('Returns correct count after registrations', () => {
            registry.register('action1', 'Tool1');
            assert.strictEqual(registry.size, 1);

            registry.register('action2', 'Tool2');
            assert.strictEqual(registry.size, 2);

            registry.register('action3', 'Tool3');
            assert.strictEqual(registry.size, 3);
        });

        test('Returns correct count after unregistration', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');
            assert.strictEqual(registry.size, 2);

            registry.unregisterByNeuroAction('action1');
            assert.strictEqual(registry.size, 1);
        });
    });

    suite('toString', () => {
        test('Returns empty message for empty registry', () => {
            const str = registry.toString();
            assert.ok(str.includes('empty'));
        });

        test('Returns formatted mappings', () => {
            registry.register('action1', 'Tool1');
            registry.register('action2', 'Tool2');

            const str = registry.toString();

            assert.ok(str.includes('action1 ↔ Tool1'));
            assert.ok(str.includes('action2 ↔ Tool2'));
            assert.ok(str.includes('2 mappings'));
        });
    });
});

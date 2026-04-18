import { validate } from 'jsonschema';
import type { JSONSchema7 } from 'json-schema';
import assert from 'node:assert';
import { CATEGORY_TERMINAL, terminalActions } from '~/src/pseudoterminal';
import { CATEGORY_TASKS, taskActions } from '~/src/tasks';

suite('Validate action schemas', async () => {
    const metaschema = await (await fetch('https://json-schema.org/draft-07/schema#')).json() as JSONSchema7;

    test('Pseudoterminal Actions', () => {
        const actions = Object.keys(terminalActions) as (keyof typeof terminalActions)[];
        for (const a of actions) {
            assert.strictEqual(a, terminalActions[a].name);
            assert.strictEqual(CATEGORY_TERMINAL, terminalActions[a].category);
            if ('schema' in terminalActions[a] && terminalActions[a].schema) {
                assert.ok(validate(terminalActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Terminate Task Action', () => {
        const actions = Object.keys(taskActions) as (keyof typeof taskActions)[];
        for (const a of actions) {
            assert.strictEqual(a, taskActions[a].name);
            assert.strictEqual(CATEGORY_TASKS, taskActions[a].category);
        }
    });
});

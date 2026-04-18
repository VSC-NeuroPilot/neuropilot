import { validate } from 'jsonschema';
import type { JSONSchema7 } from 'json-schema';
import { CATEGORY_FILE_ACTIONS, fileActions } from '~/src/file_actions';
import assert from 'node:assert';
import { CATEGORY_EDITING, editingActions } from '~/src/editing';
import { changelogActions } from '~/src/changelog';
import { REQUEST_COOKIE_ACTION } from '@/functions/cookies';
import { CATEGORY_GIT, CATEGORY_GIT_CONFIG, CATEGORY_GIT_REMOTES, gitActions } from '~/src/git';
import { chatAction } from '~/src/chat';
import { completeCodeAction } from '~/src/completions';
import { CATEGORY_MISC } from '~/src/rce';
import { lintActions } from '~/src/lint_problems';

suite('Validate action metadata', async () => {
    const metaschema = await (await fetch('https://json-schema.org/draft-07/schema#')).json() as JSONSchema7;

    test('File Actions', () => {
        const actions = Object.keys(fileActions) as (keyof typeof fileActions)[];
        for (const a of actions) {
            assert.strictEqual(a, fileActions[a].name);
            assert.strictEqual(CATEGORY_FILE_ACTIONS, fileActions[a].category);
            if (fileActions[a].schema) {
                assert.ok(validate(fileActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Edit Actions', () => {
        const actions = Object.keys(editingActions) as (keyof typeof editingActions)[];
        for (const a of actions) {
            assert.strictEqual(a, editingActions[a].name);
            assert.strictEqual(CATEGORY_EDITING, editingActions[a].category);
            if ('schema' in editingActions[a] && editingActions[a].schema) {
                assert.ok(validate(editingActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Git Actions', () => {
        const actions = Object.keys(gitActions) as (keyof typeof gitActions)[];
        for (const a of actions) {
            assert.strictEqual(a, gitActions[a].name);
            assert.ok([CATEGORY_GIT, CATEGORY_GIT_CONFIG, CATEGORY_GIT_REMOTES].includes(gitActions[a].category));
            if ('schema' in gitActions[a] && gitActions[a].schema) {
                assert.ok(validate(gitActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Lint Actions', () => {
        const actions = Object.keys(lintActions) as (keyof typeof lintActions)[];
        for (const a of actions) {
            assert.strictEqual(a, lintActions[a].name);
            if ('schema' in lintActions[a] && lintActions[a].schema) {
                assert.ok(validate(lintActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Copilot Chat integrations', () => {
        const actionsToTest = {
            chat: chatAction,
            complete_code: completeCodeAction,
        };
        const actions = Object.keys(actionsToTest) as (keyof typeof actionsToTest)[];
        for (const a of actions) {
            assert.strictEqual(a, actionsToTest[a].name);
            assert.ok(validate(actionsToTest[a].schema, metaschema).valid);
        }
    });

    test('Misc Actions', () => {
        const actionsToTest = {
            ...changelogActions,
            request_cookie: REQUEST_COOKIE_ACTION,
        };
        const actions = Object.keys(actionsToTest) as (keyof typeof actionsToTest)[];
        for (const a of actions) {
            assert.strictEqual(a, actionsToTest[a].name);
            assert.strictEqual(CATEGORY_MISC, actionsToTest[a].category);
            if (actionsToTest[a].schema) {
                assert.ok(validate(actionsToTest[a].schema, metaschema).valid);
            }
        }
    });
});

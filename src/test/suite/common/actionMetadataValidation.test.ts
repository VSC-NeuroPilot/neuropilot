import { validate } from 'jsonschema';
import type { JSONSchema7 } from 'json-schema';
import { CATEGORY_FILE_ACTIONS, fileActions } from '@/file_operations';
import assert from 'node:assert';
import { CATEGORY_EDITING, editFileActions } from '@/edit_files';
import { changelogActions } from '@/changelog';
import { REQUEST_COOKIE_ACTION } from '@/functions/cookies';
import { CATEGORY_GIT, CATEGORY_GIT_CONFIG, CATEGORY_GIT_REMOTES, gitActions } from '@/git';
import { chatAction } from '@/chat';
import { completeCodeAction } from '@/completions';
import { CATEGORY_MISC } from '@/rce';
import { lintActions } from '@/lint_problems';

suite('Validate action metadata', async () => {
    const metaschema = await (await fetch('https://json-schema.org/draft-07/schema#')).json() as JSONSchema7;

    test('File Actions', () => {
        const actions = Object.keys(fileActions) as (keyof typeof fileActions)[];
        for (const a of actions) {
            assert.strictEqual(a, fileActions[a].name);
            assert.strictEqual(CATEGORY_FILE_ACTIONS, fileActions[a].category);
            if ('schema' in fileActions[a] && fileActions[a].schema) {
                // fileActions[a].schema is now safely accessible
                const schema = fileActions[a].schema;
                assert.ok(validate(schema, metaschema).valid);
            }
        }
    });

    test('Edit Actions', () => {
        const actions = Object.keys(editFileActions) as (keyof typeof editFileActions)[];
        for (const a of actions) {
            assert.strictEqual(a, editFileActions[a].name);
            assert.strictEqual(CATEGORY_EDITING, editFileActions[a].category);
            if ('schema' in editFileActions[a] && editFileActions[a].schema) {
                // editFileActions[a].schema is now safely accessible
                const schema = editFileActions[a].schema;
                assert.ok(validate(schema, metaschema).valid);
            }
        }
    });

    test('Git Actions', () => {
        const actions = Object.keys(gitActions) as (keyof typeof gitActions)[];
        for (const a of actions) {
            assert.strictEqual(a, gitActions[a].name);
            assert.ok([CATEGORY_GIT, CATEGORY_GIT_CONFIG, CATEGORY_GIT_REMOTES].includes(gitActions[a].category));
            if ('schema' in gitActions[a] && gitActions[a].schema) {
                // gitActions[a].schema is now safely accessible
                const schema = gitActions[a].schema;
                assert.ok(validate(schema, metaschema).valid);
            }
        }
    });

    test('Lint Actions', () => {
        const actions = Object.keys(lintActions) as (keyof typeof lintActions)[];
        for (const a of actions) {
            assert.strictEqual(a, lintActions[a].name);
            if ('schema' in lintActions[a] && lintActions[a].schema) {
                // lintActions[a].schema is now safely accessible
                const schema = lintActions[a].schema;
                assert.ok(validate(schema, metaschema).valid);
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
                // actionsToTest[a].schema is now safely accessible
                const schema = actionsToTest[a].schema;
                assert.ok(validate(schema, metaschema).valid);
            }
        }
    });
});

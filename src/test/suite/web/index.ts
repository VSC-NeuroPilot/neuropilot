// NOTE: Web test host shim
// The VS Code web test environment does not always expose a complete browser
// global surface early in startup. Keep this shim to ensure `navigator.language`
// exists for any polyfills/utilities that read it during import time. Removing
// this can cause brittle test failures that depend on environment timing.
if (typeof globalThis !== 'undefined' && typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { language: 'en-US' } as Navigator;
}

// Use the global Mocha provided by the web test runner

import Mocha from 'mocha';
import 'mocha';

// Extension unit tests
import './extension.test';
import '../file_actions.test';
import '../utils.test';
// Common integration tests that are environment-agnostic
import '../common/editing_actions.test';
import '../common/changelog_action.test';
// Unit prompt-only tests (pure logic)
import '../../unit-test/delete_lines.simple.test';
import '../../unit-test/delete_text.simple.test';
import '../../unit-test/file_actions.simple.test';
import '../../unit-test/find_text.simple.test';
import '../../unit-test/get_file_contents.simple.test';
import '../../unit-test/get_cursor.simple.test';
import '../../unit-test/git.simple.test';
import '../../unit-test/highlight_lines.simple.test';
import '../../unit-test/insert_lines.simple.test';
import '../../unit-test/insert_text.simple.test';
import '../../unit-test/lint_problems.simple.test';
import '../../unit-test/place_cursor.simple.test';
import '../../unit-test/replace_text.simple.test';
import '../../unit-test/rewrite_all.simple.test';
import '../../unit-test/rewrite_lines.simple.test';
import '../../unit-test/tasks.simple.test';
import '../../unit-test/rce.simple.test';
import '../../unit-test/undo_and_save.simple.test';

// Testing the meta stuff
import '../test_utils.test';
// Common env-agnostic tests
import '../../unit-test/rewrite_all.simple.test';

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true });
    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (erm) {
            reject(erm);
        }
    });
}

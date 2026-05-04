// The VS Code test CLI loads this file directly and sets up Mocha globals.
// Import suites here so they register with the CLI's Mocha instance.
import * as vscode from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';
import { NEURO } from '@/constants';

if (globalThis?.process?.env?.NEUROPILOT_TEST === 'true') {
    const originalError = console.error;
    const originalWarn = console.warn;
    const isNoise = (message: string) =>
        message.includes('WebSocket is not open') ||
        message.includes('DisposableStore that has already been disposed');
    console.error = (...args) => {
        const message = args.map(String).join(' ');
        if (isNoise(message)) return;
        originalError(...args);
    };
    console.warn = (...args) => {
        const message = args.map(String).join(' ');
        if (isNoise(message)) return;
        originalWarn(...args);
    };
}

const globalWithTest = globalThis as typeof globalThis & { NEUROPILOT_TEST?: boolean };
globalWithTest.NEUROPILOT_TEST = true;
NeuroClient.prototype.sendContext = () => {};
NeuroClient.prototype.registerActions = () => {};
NeuroClient.prototype.unregisterActions = () => {};
NeuroClient.prototype.sendActionResult = () => {};
NeuroClient.prototype.onAction = () => {};

if (!NEURO.outputChannel) {
    NEURO.outputChannel = vscode.window.createOutputChannel('Neuropilot Test');
}
if (!NEURO.client) {
    NEURO.client = {
        sendContext: () => {},
        disconnect: () => {},
        registerActions: () => {},
        unregisterActions: () => {},
        sendActionResult: () => {},
        onAction: () => {},
    } as unknown as NeuroClient;
}

import './extension.test';
import '../file_actions.test';
import '../utils.test';
import '../ignore_files_utils.test';
// Common integration tests that are environment-agnostic
import '../common/editing_actions.test';
import '../common/changelog_action.test';
// Unit prompt-only tests (pure logic)
import '../../unit-test/delete_lines.simple.test';
import '../../unit-test/delete_text.simple.test';
import '../../unit-test/file_actions.simple.test';
import '../../unit-test/find_text.simple.test';
import '../../unit-test/get_cursor.simple.test';
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
import '../../unit-test/terminal.simple.test';
import '../../unit-test/undo_and_save.simple.test';
// API logic
import '../../unit-test/api/companion.test';

// Testing the meta stuff
import '../test_utils.test';
import '../common/actionMetadataValidation.test';
import './actionMetadataValidation.test';

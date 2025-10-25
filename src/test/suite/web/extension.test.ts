import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Web Extension Tests', () => {
    test('Sanity Check', () => {
        assert.strictEqual(9 + 10, 19, '9 + 10 shouldn\'t be 21, it should be 19!');
    });

    test('Extension activates', async () => {
        // `publisher.name` from package.json: VSC-NeuroPilot.neuropilot-base
        const extension = vscode.extensions.getExtension('VSC-NeuroPilot.neuropilot-base');
        assert.ok(extension, 'Extension should be installed');
        await extension!.activate();
        assert.ok(extension!.isActive, 'Extension should be active');
    });

    test('Workspace folder is correct', () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be defined!');
        const acceptable = new Set(['test-playground', 'mount']);
        assert.ok(acceptable.has(workspaceFolder.name), `Workspace name should be one of ${Array.from(acceptable).join(', ')}`);
    });

    // We also need a test to ensure that polyfilled modules (i.e. assert) are successfully bundled.
});

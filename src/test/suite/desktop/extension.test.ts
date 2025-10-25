import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Integration: Desktop extension smoke', () => {
    test('Sanity Check', () => {
        assert.strictEqual(9 + 10, 19, '9 + 10 shouldn\'t be 21, it should be 19!');
    });

    test('Extension exists', async () => {
        const extension = vscode.extensions.getExtension('VSC-NeuroPilot.neuropilot-base');
        assert.ok(extension, 'Extension vsc-neuropilot.neuropilot-base should be installed!');
        await extension.activate();
        assert.ok(extension.isActive, 'Extension should be active!');
    });

    test('Workspace folder is correct', function() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be defined!');
        assert.strictEqual(workspaceFolder.name, 'test-playground', 'Workspace folder name should be test-playground!');
    });
});

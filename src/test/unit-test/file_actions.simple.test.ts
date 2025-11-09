import * as assert from 'assert';
import { fileActions } from '@/file_actions';
import { ActionData } from '@/neuro_client_helper';

// Tests for file action prompt generators using real logic with loose checks
suite('file Actions', () => {
    test('get_workspace_files has a non-empty prompt', () => {
        // === Arrange & Act ===
        const prompt = fileActions.get_workspace_files.promptGenerator({} as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('get_workspace_files correctly includes the folder in prompt', () => {
        // === Arrange & Act ===
        const prompt = fileActions.get_workspace_files.promptGenerator({ params: { folder: 'src/' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src'));
    });

    test('get_workspace_files correctly states if Neuro asked for recursive', () => {
        // === Arrange & Act ===
        const prompt = fileActions.get_workspace_files.promptGenerator({ params: { recursive: true } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('Recursively'));
    });

    test('get_workspace_files correctly omits recursive if Neuro didn\'t ask', () => {
        // === Arrange & Act ===
        const prompt = fileActions.get_workspace_files.promptGenerator({ params: { recursive: false } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(!prompt.includes('recursively'));
    });

    test('open_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.open_file.promptGenerator({ params: { filePath: 'src/index.ts' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/index.ts'));
    });

    test('read_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.read_file.promptGenerator({ params: { filePath: 'README.md' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('README.md'));
    });

    test('create_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.create_file.promptGenerator({ params: { filePath: 'new/file.txt' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/file.txt'));
    });

    test('create_folder prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.create_folder.promptGenerator({ params: { folderPath: 'new/folder' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/folder'));
    });

    test('rename_file_or_folder prompt formats paths', () => {
        // === Arrange & Act ===
        const prompt = fileActions.rename_file_or_folder.promptGenerator({ params: { oldPath: 'old/a.txt', newPath: 'new/a.txt' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/a.txt'));
        assert.ok(prompt.includes('new/a.txt'));
    });

    test('delete_file_or_folder prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.delete_file_or_folder.promptGenerator({ params: { path: 'old/file.txt' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/file.txt'));
    });
});



import * as assert from 'assert';
import { fileActions } from '@/file_operations';
import { readFileActions } from '@/read_files';
import type { RCEContext } from '@/context/rce';

// Tests for file action prompt generators using real logic with loose checks
suite('file Actions', () => {
    test('get_workspace_files has a non-empty prompt', () => {
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator({ data: { params: {} } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('get_workspace_files correctly includes the folder in prompt', () => {
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator({ data: { params: { folder: 'src/' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src'));
    });

    test('get_workspace_files correctly states if Neuro asked for recursive', () => {
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator({ data: { params: { recursive: true } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('recursively'));
    });

    test('get_workspace_files correctly omits recursive if Neuro didn\'t ask', () => {
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator({ data: { params: { recursive: false } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(!prompt.includes('recursively'));
    });

    test('open_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.switch_files.promptGenerator({ data: { params: { filePath: 'src/index.ts' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/index.ts'));
    });

    test('read_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.read_file.promptGenerator({ data: { params: { filePath: 'README.md' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('README.md'));
    });

    test('create_file prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.create_file.promptGenerator({ data: { params: { filePath: 'new/file.txt' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/file.txt'));
    });

    test('create_folder prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.create_folder.promptGenerator({ data: { params: { folderPath: 'new/folder' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/folder'));
    });

    test('rename_file_or_folder prompt formats paths', () => {
        // === Arrange & Act ===
        const prompt = fileActions.rename_file_or_folder.promptGenerator({ data: { params: { oldPath: 'old/a.txt', newPath: 'new/a.txt' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/a.txt'));
        assert.ok(prompt.includes('new/a.txt'));
    });

    test('delete_file_or_folder prompt formats path', () => {
        // === Arrange & Act ===
        const prompt = fileActions.delete_file_or_folder.promptGenerator({ data: { params: { path: 'old/file.txt' } } } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/file.txt'));
    });
});



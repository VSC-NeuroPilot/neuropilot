import * as assert from 'assert';
import { fileActions } from '@/file_operations';
import { readFileActions } from '@/read_files';
import { fakeContext } from '@test/test_utils';

// Tests for file action prompt generators using real logic with loose checks
suite('file Actions', () => {
    test('get_workspace_files has a non-empty prompt', () => {
        assert.ok(fileActions.list_files_and_folders.promptGenerator && typeof fileActions.list_files_and_folders.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator(fakeContext('list_files_and_folders', {}));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('get_workspace_files correctly includes the folder in prompt', () => {
        assert.ok(fileActions.list_files_and_folders.promptGenerator && typeof fileActions.list_files_and_folders.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator(fakeContext('list_files_and_folders', { folder: 'src/' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src'));
    });

    test('get_workspace_files correctly states if Neuro asked for recursive', () => {
        assert.ok(fileActions.list_files_and_folders.promptGenerator && typeof fileActions.list_files_and_folders.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator(fakeContext('list_files_and_folders', { recursive: true }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('recursively'));
    });

    test('get_workspace_files correctly omits recursive if Neuro didn\'t ask', () => {
        assert.ok(fileActions.list_files_and_folders.promptGenerator && typeof fileActions.list_files_and_folders.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.list_files_and_folders.promptGenerator(fakeContext('list_files_and_folders', { recursive: false }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(!prompt.includes('recursively'));
    });

    test('open_file prompt formats path', () => {
        assert.ok(readFileActions.switch_files.promptGenerator && typeof readFileActions.switch_files.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.switch_files.promptGenerator(fakeContext('switch_files', { filePath: 'src/index.ts' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/index.ts'));
    });

    test('read_file prompt formats path', () => {
        assert.ok(readFileActions.read_file.promptGenerator && typeof readFileActions.read_file.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.read_file.promptGenerator(fakeContext('read_files', { filePath: 'README.md' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('README.md'));
    });

    test('create_file prompt formats path', () => {
        assert.ok(fileActions.create_file.promptGenerator && typeof fileActions.create_file.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.create_file.promptGenerator(fakeContext('create_file', { filePath: 'new/file.txt' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/file.txt'));
    });

    test('create_folder prompt formats path', () => {
        assert.ok(fileActions.create_folder.promptGenerator && typeof fileActions.create_folder.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.create_folder.promptGenerator(fakeContext('create_folder', { folderPath: 'new/folder' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/folder'));
    });

    test('rename_file_or_folder prompt formats paths', () => {
        assert.ok(fileActions.rename_file_or_folder.promptGenerator && typeof fileActions.rename_file_or_folder.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.rename_file_or_folder.promptGenerator(fakeContext('rename_file_or_folder', { oldPath: 'old/a.txt', newPath: 'new/a.txt' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/a.txt'));
        assert.ok(prompt.includes('new/a.txt'));
    });

    test('delete_file_or_folder prompt formats path', () => {
        assert.ok(fileActions.delete_file_or_folder.promptGenerator && typeof fileActions.delete_file_or_folder.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = fileActions.delete_file_or_folder.promptGenerator(fakeContext('delete_file_or_folder', { path: 'old/file.txt' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/file.txt'));
    });
});



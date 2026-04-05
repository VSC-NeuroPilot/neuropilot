import * as assert from 'assert';
import * as vscode from 'vscode';
import { type ActionData, NeuroClient } from 'neuro-game-sdk';
import { PermissionLevel } from '@vsc-neuropilot/api-types';

import * as fileActions from '@/file_actions';
import { assertProperties, checkNoErrorWithTimeout, createTestDirectory, createTestFile, returnMockFunction } from '@test/test_utils';
import type { RCEContext } from '@/context/rce';
import { getPermissionLevel } from '@/config';
import { NEURO } from '@/constants';
import { anything, capture, instance, mock, verify } from 'ts-mockito';

const makeContext = (data: ActionData) => ({ data, updateStatus: returnMockFunction() } as unknown as RCEContext);

suite('File Actions', () => {
    let originalClient: NeuroClient | null = null;
    let mockedClient: NeuroClient;

    function withTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs = 5000): Promise<T> {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`));
            }, timeoutMs);
        });
        return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        });
    }

    setup(async function () {
        this.timeout(10000);
        // Mock the NeuroClient to avoid actual network calls
        originalClient = NEURO.client;
        mockedClient = mock(NeuroClient);
        NEURO.client = instance(mockedClient);

        // Close all open editors
        await withTimeout(vscode.commands.executeCommand('workbench.action.closeAllEditors'), 'closeAllEditors');
    });

    teardown(async function () {
        this.timeout(10000);
        // Delete all test files created during the tests
        const testFilesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files');
        await withTimeout(
            vscode.workspace.fs.delete(testFilesDir, { recursive: true, useTrash: false }),
            'delete test_files',
        );

        // Restore the original NeuroClient
        NEURO.client = originalClient;
        originalClient = null;
    });

    test('validatePath', async function () {
        const validatePath = fileActions._internals.validatePath;

        // === Arrange ===
        const existingFileUri = await createTestFile('validFile.js');
        const unsafeFileUri = await createTestFile('.unsafeFile.js'); // Neuro-unsafe because it starts with a dot
        const existingFilePath = vscode.workspace.asRelativePath(existingFileUri, false);
        const unsafeFilePath = vscode.workspace.asRelativePath(unsafeFileUri, false);
        const nonexistentPath = 'nonexistent/file.js';

        // === Act & Assert ===
        assertProperties(await validatePath('', true, 'file'), { success: false, retry: true }, 'Empty path should be invalid');

        assertProperties(await validatePath(existingFilePath, true, 'file'), { success: true }, 'Existing path should be valid if shouldExist is true');
        assertProperties(await validatePath(existingFilePath, false, 'file'), { success: false, retry: false }, 'Existing path should not be valid if shouldExist is false');
        assertProperties(await validatePath(unsafeFilePath, true, 'file'), { success: false, retry: false }, 'Unsafe path should be invalid if shouldExist is true');
        assertProperties(await validatePath(unsafeFilePath, false, 'file'), { success: false, retry: false }, 'Unsafe path should not be valid if shouldExist is false');
        assertProperties(await validatePath(nonexistentPath, true, 'file'), { success: false, retry: false }, 'Nonexistent path should be invalid if shouldExist is true');
        assertProperties(await validatePath(nonexistentPath, false, 'file'), { success: true }, 'Nonexistent path should be valid if shouldExist is false');
    });

    test('validateIsAFile', async function () {
        const validateIsAFile = fileActions._internals.validateIsAFile;
        const baseAction: ActionData = {
            id: 'abc',
            name: 'open_file',
        };

        // === Arrange ===
        const fileUri = await createTestFile('file-to-validate.txt');
        const dirUri = await createTestDirectory('dir-to-validate');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const dirPath = vscode.workspace.asRelativePath(dirUri, false);
        const nonExistentPath = 'test_files/does-not-exist.txt';

        // === Act & Assert ===
        assertProperties(await validateIsAFile(makeContext(baseAction)), { success: false, retry: true }, 'Missing filePath should be invalid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: {} })), { success: false, retry: true }, 'Undefined filePath should be invalid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: '' } })), { success: false, retry: true }, 'Empty filePath should be invalid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: '/' } })), { success: false, retry: true }, 'Root-only path should be invalid');

        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: dirPath } })), { success: false, retry: false }, 'Directory path should be invalid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: nonExistentPath } })), { success: false, retry: false }, 'Nonexistent file should be invalid');

        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath } })), { success: true }, 'Existing file should be valid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: '/' + filePath } })), { success: true }, 'Path with leading slash should be valid');
        assertProperties(await validateIsAFile(makeContext({ ...baseAction, params: { filePath: './' + filePath } })), { success: true }, 'Path with leading dot slash should be valid');
    });

    test('neuroSafeRenameValidation', async function () {
        const neuroSafeRenameValidation = fileActions._internals.neuroSafeRenameValidation;

        // === Arrange ===
        const fileUri1 = await createTestFile('file1.js');
        const fileUri2 = await createTestFile('file2.js');
        const unsafeUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const filePath1 = vscode.workspace.asRelativePath(fileUri1, false);
        const filePath2 = vscode.workspace.asRelativePath(fileUri2, false);
        const unsafePath = vscode.workspace.asRelativePath(unsafeUri, false);
        const nonexistentPath = 'nonexistent/file.js';
        const nonexistentPath2 = 'nonexistent/file2.js';
        const unsafeNonexistentPath = '.unsafe/nonexistent/file.js';

        // === Act & Assert ===

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: nonexistentPath,
            },
        } as ActionData)), { success: true }, 'Rename should succeed if there is no file with the new name');

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: filePath2,
            },
        } as ActionData)), { success: false, retry: false }, 'Rename should fail if a file with the new name already exists');

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: unsafeNonexistentPath,
            },
        } as ActionData)), { success: false, retry: false }, 'Rename should fail if the new path is unsafe');

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: unsafePath,
                newPath: nonexistentPath,
            },
        } as ActionData)), { success: false, retry: false }, 'Rename should fail if the old path is unsafe');

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: nonexistentPath,
                newPath: nonexistentPath2,
            },
        } as ActionData)), { success: false, retry: false }, 'Rename should fail if the old path does not exist');

        assertProperties(await neuroSafeRenameValidation(makeContext({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: filePath1,
            },
        } as ActionData)), { success: false, retry: false }, 'Rename should fail if the old and new paths are the same');
    });

    test('neuroSafeDeleteValidation', async function () {
        const neuroSafeDeleteValidation = fileActions._internals.neuroSafeDeleteValidation;

        // === Arrange ===
        const fileUri = await createTestFile('fileToDelete.js');
        const unsafeUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const dirUri = await createTestDirectory('dirToDelete');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const dirPath = vscode.workspace.asRelativePath(dirUri, false);
        const unsafePath = vscode.workspace.asRelativePath(unsafeUri, false);
        const nonexistentFilePath = 'nonexistent/file.js';
        const nonexistentDirPath = 'nonexistent/dir';

        // === Act & Assert ===
        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: filePath,
                recursive: false,
            },
        } as ActionData)), { success: true }, 'Non-recursive delete should succeed for an existing file');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: filePath,
                recursive: true,
            },
        } as ActionData)), { success: false, retry: false }, 'Recursive delete should fail for an existing file');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: dirPath,
                recursive: false,
            },
        } as ActionData)), { success: false, retry: false }, 'Non-recursive delete should fail for an existing directory');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: dirPath,
                recursive: true,
            },
        } as ActionData)), { success: true }, 'Recursive delete should succeed for an existing directory');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: unsafePath,
                recursive: false,
            },
        } as ActionData)), { success: false, retry: false }, 'Delete should fail for an unsafe file');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: nonexistentFilePath,
                recursive: false,
            },
        } as ActionData)), { success: false, retry: false }, 'Non-recursive delete should fail for a nonexistent file');

        assertProperties(await neuroSafeDeleteValidation(makeContext({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: nonexistentDirPath,
                recursive: true,
            },
        } as ActionData)), { success: false, retry: false }, 'Recursive delete should fail for a nonexistent directory');
    });

    test('handleGetWorkspaceFiles', async function () {
        // === Arrange ===
        const fileUri1 = await createTestFile('file1.js');
        const fileUri2 = await createTestDirectory('sub');
        const fileUri3 = await createTestFile('sub/file2.js');
        const unsafeFileUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const emptyDirUri = await createTestDirectory('testDir');
        const filePath1 = vscode.workspace.asRelativePath(fileUri1, false);
        const filePath2 = vscode.workspace.asRelativePath(fileUri2, false);
        const filePath3 = vscode.workspace.asRelativePath(fileUri3, false);
        const unsafeFilePath = vscode.workspace.asRelativePath(unsafeFileUri, false);
        const emptyDirPath = vscode.workspace.asRelativePath(emptyDirUri, false);

        // === Act ===
        const result = await fileActions.handleGetWorkspaceFiles(makeContext({ id: 'abc', name: 'get_workspace_files', params: { folder: 'test_files' } } as ActionData));
        const context = result?.message ?? '';
        const lines = context.split(/\r?\n/);
        lines.shift(); // Remove header line
        lines.shift(); // Remove empty line

        // === Assert ===
        assert.strictEqual(lines.includes(filePath1), true, 'File file1.js should be in the list of files');
        const expectedFolderSub = filePath2.endsWith('/') ? filePath2 : filePath2 + '/';
        assert.strictEqual(lines.includes(expectedFolderSub), true, 'Folder sub should be in the list of files');
        assert.strictEqual(lines.includes(filePath3), false, 'File sub/file2.js should not be in the list of files');
        assert.strictEqual(lines.includes(unsafeFilePath), false, 'Unsafe directory .unsafe should not be in the list of files');
        const expectedEmptyDir = emptyDirPath.endsWith('/') ? emptyDirPath : emptyDirPath + '/';
        assert.strictEqual(lines.includes(expectedEmptyDir), true, 'Empty directory testDir should still be in the list of files');
    });

    test('handleGetWorkspaceFiles (recursive)', async function () {
        // === Arrange ===
        const fileUri1 = await createTestFile('file1.js');
        const fileUri2 = await createTestFile('sub/file2.js');
        const unsafeFileUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const emptyDirUri = await createTestDirectory('testDir');
        const filePath1 = vscode.workspace.asRelativePath(fileUri1, false);
        const filePath2 = vscode.workspace.asRelativePath(fileUri2, false);
        const unsafeFilePath = vscode.workspace.asRelativePath(unsafeFileUri, false);
        const emptyDirPath = vscode.workspace.asRelativePath(emptyDirUri, false);

        // === Act ===
        const result = await fileActions.handleGetWorkspaceFiles(makeContext({ id: 'abc', name: 'get_workspace_files', params: { recursive: true } } as ActionData));
        const context = result?.message ?? '';
        const lines = context.split(/\r?\n/);
        lines.shift(); // Remove header line
        lines.shift(); // Remove empty line

        // === Assert ===
        assert.strictEqual(lines.includes(filePath1), true, 'File file1.js should be in the list of files');
        assert.strictEqual(lines.includes(filePath2), true, 'File sub/file2.js should be in the list of files');
        assert.strictEqual(lines.includes(unsafeFilePath), false, 'Unsafe file .unsafe/file.js should not be in the list of files');
        assert.strictEqual(lines.includes(emptyDirPath), false, 'Empty directory testDir should not be in the list of files');
    });

    test('handleOpenFile', async function () {
        // Increase test timeout to make sure it has enough time to finish instead of the default 2s
        this.timeout(10000);
        // === Arrange ===
        const fileContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n68043cf7-01af-43cb-a9ac-6feeec7cdcc1\n';
        const fileUri = await createTestFile('file.js', fileContent);
        const filePath = vscode.workspace.asRelativePath(fileUri, false);

        // Open, show, and save the file to ensure VSCode text model provider tracks it
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
        await doc.save();

        // Ensure contents are sent on open in this test scenario
        const config = vscode.workspace.getConfiguration('neuropilot');
        const originalSetting = config.get<boolean>('sendContentsOnFileChange');
        await config.update('sendContentsOnFileChange', false, vscode.ConfigurationTarget.Workspace);
        // Fix issue with mock client not being correctly set at this point
        NEURO.client = instance(mockedClient);

        // === Act ===
        fileActions.handleOpenFile(makeContext({ id: 'abc', name: 'open_file', params: { filePath: filePath } } as ActionData));
        // Allow VS Code to open and show the document before asserting
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        // Brief delay to ensure activeTextEditor is updated across platforms
        await new Promise(resolve => setTimeout(resolve, 200));
        const [context] = capture(mockedClient.sendContext).last();

        // === Assert ===
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.path.toLowerCase(), fileUri.path.toLowerCase(), 'The correct file should be opened in the active editor');
        assert.strictEqual(context.includes(fileContent), true, 'The file content should be sent in the context');

        // Restore setting
        await config.update('sendContentsOnFileChange', originalSetting ?? true, vscode.ConfigurationTarget.Workspace);
    });

    test('handleCreateFile', async function () {
        // === Arrange ===
        const relativePath = 'test_files/newFile.js';
        const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relativePath);

        // === Act ===
        await fileActions.handleCreateFile(makeContext({ id: 'abc', name: 'create_file', params: { filePath: relativePath } } as ActionData));
        const openAllowed = getPermissionLevel(fileActions.fileActions.switch_files.name) === PermissionLevel.AUTOPILOT;

        // === Assert ===
        if (openAllowed) {
            assert.strictEqual(vscode.window.activeTextEditor?.document.uri.path.toLowerCase(), uri.path.toLowerCase(), 'The new file should be opened in the active editor');
        }

        const stat = await vscode.workspace.fs.stat(uri);
        assert.strictEqual(stat.type, vscode.FileType.File, 'The new file should be created successfully');
    });

    test('handleCreateFolder', async function () {
        // === Arrange ===
        const relativePath = 'test_files/newFolder';
        const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relativePath);

        // === Act ===
        await fileActions.handleCreateFolder(makeContext({ id: 'abc', name: 'create_folder', params: { folderPath: relativePath } } as ActionData));

        // === Assert ===
        const stat = await vscode.workspace.fs.stat(uri);
        assert.strictEqual(stat.type, vscode.FileType.Directory, 'The new folder should be created successfully');
    });

    test('handleRenameFileOrFolder: Rename closed file', async function () {
        // === Arrange ===
        const fileUri = await createTestFile('fileToRename.js');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const newFilePath = 'test_files/renamedFile.js';
        const newFileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, newFilePath);

        // === Act ===
        await fileActions.handleRenameFileOrFolder(makeContext({ id: 'abc', name: 'rename_file_or_folder', params: { oldPath: filePath, newPath: newFilePath } } as ActionData));

        // === Assert ===
        assert.strictEqual(vscode.window.visibleTextEditors.some(editor => editor.document.uri.path.toLowerCase() === newFileUri.path.toLowerCase()), false, 'Renaming a file should not open the renamed file in the editor');

        const stat = await vscode.workspace.fs.stat(newFileUri);
        assert.strictEqual(stat.type, vscode.FileType.File, 'The file should exist at the new path');

        try {
            await vscode.workspace.fs.stat(fileUri);
            assert.fail(`File ${filePath} should not exist after renaming, but it does.`);
        } catch (erm) {
            if (erm instanceof assert.AssertionError) throw erm;
            // Expected error, file should not exist
        }
    });

    test('handleRenameFileOrFolder: Rename open file', async function () {
        // === Arrange ===
        const fileUri = await createTestFile('fileToRename.js');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const newFilePath = 'test_files/renamedFile.js';
        const newFileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, newFilePath);
        const otherFileUri = await createTestFile('otherFile.js');

        // === Act ===
        await vscode.window.showTextDocument(fileUri, { preview: false });
        await vscode.window.showTextDocument(otherFileUri, { preview: false });

        await fileActions.handleRenameFileOrFolder(makeContext({ id: 'abc', name: 'rename_file_or_folder', params: { oldPath: filePath, newPath: newFilePath } } as ActionData));

        // Wait for the editor to update
        await new Promise(resolve => setTimeout(resolve, 200));

        const uris = vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => {
            if (tab.input instanceof vscode.TabInputText) {
                return tab.input.uri;
            }
            assert.fail(`Tab input is not a Text Document: ${tab.input}`);
        }));

        // === Assert ===
        // Keep focus on the previously active editor (unrelated to the renamed file)
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.path.toLowerCase(), otherFileUri.path.toLowerCase(), 'The other file should still be active');

        // VS Code auto-remaps open tabs on rename. Desktop (file scheme) reliably closes the old tab;
        // in web/virtual FS the tab may transiently linger without breaking correctness. Only enforce on desktop.
        // TODO: Figure out why web behaves differently here.
        const workspaceScheme = vscode.workspace.workspaceFolders![0].uri.scheme;
        const isDesktop = workspaceScheme === 'file';
        if (isDesktop) {
            assert.strictEqual(uris.some(uri => uri.path.toLowerCase() === fileUri.path.toLowerCase()), false, 'The old file should not be open');
        }
        const newStat = await vscode.workspace.fs.stat(newFileUri);
        assert.strictEqual(newStat.type, vscode.FileType.File, 'The file should exist at the new path');
    });

    test('handleRenameFileOrFolder: Rename folder with open file', async function () {
        // === Arrange ===
        const folderUri = await createTestDirectory('folderToRename');
        const fileUri = await createTestFile('folderToRename/file.js');
        const folderPath = vscode.workspace.asRelativePath(folderUri, false);
        const newFolderPath = 'test_files/renamedFolder';
        const newFilePath = 'test_files/renamedFolder/file.js';
        const newFolderUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, newFolderPath);
        const newFileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, newFilePath);

        // === Act ===
        await vscode.window.showTextDocument(fileUri, { preview: false });

        await fileActions.handleRenameFileOrFolder(makeContext({ id: 'abc', name: 'rename_file_or_folder', params: { oldPath: folderPath, newPath: newFolderPath } } as ActionData));

        // Wait for the editor to update
        await new Promise(resolve => setTimeout(resolve, 100));

        const uris = vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => {
            if (tab.input instanceof vscode.TabInputText) {
                return tab.input.uri;
            }
            assert.fail(`Tab input is not a Text Document: ${tab.input}`);
        }));

        // === Assert ===
        // Desktop consistently closes the old tab after folder rename; web may not. Only enforce on desktop.
        const workspaceSchemeAfter = vscode.workspace.workspaceFolders![0].uri.scheme;
        const isDesktopAfter = workspaceSchemeAfter === 'file';
        if (isDesktopAfter) {
            assert.strictEqual(uris.some(uri => uri.path === fileUri.path), false, 'The old file should not be visible in the editor');
        }
        const stat = await vscode.workspace.fs.stat(newFolderUri);
        assert.strictEqual(stat.type, vscode.FileType.Directory, 'The folder should exist at the new path');
        const newFileStat = await vscode.workspace.fs.stat(newFileUri);
        assert.strictEqual(newFileStat.type, vscode.FileType.File, 'The file should exist at the new path');
    });

    test('handleDeleteFileOrFolder: Delete open file', async function () {
        // === Arrange ===
        const fileUri = await createTestFile('fileToDelete.js');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);

        // === Act ===
        vscode.window.showTextDocument(fileUri, { preview: false });

        await fileActions.handleDeleteFileOrFolder(makeContext({ id: 'abc', name: 'delete_file_or_folder', params: { path: filePath, recursive: false } } as ActionData));

        // === Assert ===
        try {
            await vscode.workspace.fs.stat(fileUri);
            assert.fail(`File ${filePath} should not exist after deletion, but it does.`);
        } catch (erm) {
            if (erm instanceof assert.AssertionError) throw erm;
            // Expected error, file should not exist
        }

        const scheme = vscode.workspace.workspaceFolders![0].uri.scheme;
        if (scheme === 'file') {
            assert.strictEqual(vscode.window.visibleTextEditors.some(editor => editor.document.uri.path === fileUri.path), false, 'The deleted file should not be visible in the editor');
        } // In web (virtual) FS the editor model may remain even after deletion
    });

    test('handleDeleteFileOrFolder: Delete folder', async function () {
        // === Arrange ===
        const folderUri = await createTestDirectory('folderToDelete');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const fileUri = await createTestFile('folderToDelete/file.js');
        const folderPath = vscode.workspace.asRelativePath(folderUri, false);

        // === Act ===
        // If the file is open, it can't be deleted without admin privileges.
        // This only happens in the test environment for some reason.
        // await vscode.window.showTextDocument(fileUri, { preview: false });

        await fileActions.handleDeleteFileOrFolder(makeContext({ id: 'abc', name: 'delete_file_or_folder', params: { path: folderPath, recursive: true } } as ActionData));

        // Wait for the editor to update
        await new Promise(resolve => setTimeout(resolve, 100));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const uris = vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => {
            if (tab.input instanceof vscode.TabInputText) {
                return tab.input.uri;
            }
            assert.fail(`Tab input is not a Text Document: ${tab.input}`);
        }));

        // === Assert ===
        try {
            await vscode.workspace.fs.stat(folderUri);
            assert.fail(`Folder ${folderPath} should not exist after deletion, but it does.`);
        } catch (erm) {
            if (erm instanceof assert.AssertionError) throw erm;
            // Expected error, folder should not exist
        }

        // assert.strictEqual(uris.some(uri => uri.path === fileUri.path), false, 'The deleted file should not be visible in the editor');
    });
});

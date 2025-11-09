import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    fastIsFileIgnored,
    fastIsItIgnored,
    fastIsTheFilesVisible,
    findIgnoredFile,
    getVisibleFiles,
    loadIgnoreFiles,
    resetIgnoreState,
} from '../../ignore_files_utils';

const TEST_IGNORE_FILENAME = '.neuropilotignore';

suite('Ignore Files Utils Integration', function() {
    const workspaceUri = vscode.workspace.workspaceFolders![0].uri;
    const baseDir = workspaceUri.fsPath;

    let originalInheritSetting: boolean | undefined;
    let originalIgnoreFilesSetting: string[] | undefined;

    async function writeFile(uri: vscode.Uri, contents: string) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(contents, 'utf8'));
    }

    async function createTestFile(relativeSegments: string[], contents = ''): Promise<vscode.Uri> {
        const fileUri = vscode.Uri.joinPath(workspaceUri, 'test_files', ...relativeSegments);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(contents, 'utf8'));
        return fileUri;
    }

    async function createTestDirectory(relativeSegments: string[]): Promise<vscode.Uri> {
        const dirUri = vscode.Uri.joinPath(workspaceUri, 'test_files', ...relativeSegments);
        await vscode.workspace.fs.createDirectory(dirUri);
        return dirUri;
    }

    async function writeIgnoreFile(contents: string): Promise<vscode.Uri> {
        const ignoreUri = vscode.Uri.joinPath(workspaceUri, 'test_files', TEST_IGNORE_FILENAME);
        await writeFile(ignoreUri, contents);
        return ignoreUri;
    }

    suiteSetup(async function() {
        const config = vscode.workspace.getConfiguration('neuropilot');
        originalInheritSetting = config.get<boolean>('access.inheritFromIgnoreFiles');
        originalIgnoreFilesSetting = config.get<string[]>('access.ignoreFiles');

        await config.update('access.inheritFromIgnoreFiles', true, vscode.ConfigurationTarget.Workspace);
        await config.update('access.ignoreFiles', [`test_files/${TEST_IGNORE_FILENAME}`], vscode.ConfigurationTarget.Workspace);
    });

    suiteTeardown(async function() {
        const config = vscode.workspace.getConfiguration('neuropilot');
        await config.update('access.inheritFromIgnoreFiles', originalInheritSetting, vscode.ConfigurationTarget.Workspace);
        await config.update('access.ignoreFiles', originalIgnoreFilesSetting, vscode.ConfigurationTarget.Workspace);

        try {
            await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, 'test_files'), { recursive: true, useTrash: false });
        } catch {
            // ignore cleanup errors
        }
        resetIgnoreState();
    });

    setup(async function() {
        resetIgnoreState([]);
        const testFilesDir = vscode.Uri.joinPath(workspaceUri, 'test_files');
        try {
            await vscode.workspace.fs.delete(testFilesDir, { recursive: true, useTrash: false });
        } catch {
            // ignore cleanup errors
        }
        await vscode.workspace.fs.createDirectory(testFilesDir);
    });

    test('fastIsItIgnored respects patterns loaded from ignore files', async function() {
        await writeIgnoreFile('test_files/ignored\ntest_files/ignored/**\n');

        const ignoredDir = await createTestDirectory(['ignored']);
        const ignoredFile = await createTestFile(['ignored', 'hidden.txt'], 'secret');
        const visibleFile = await createTestFile(['visible.txt'], 'visible');

        await loadIgnoreFiles(baseDir);

        assert.strictEqual(fastIsItIgnored(ignoredDir.fsPath), true, 'Ignored directory should be detected');
        assert.strictEqual(fastIsItIgnored(ignoredFile.fsPath), true, 'Ignored file should be detected');
        assert.strictEqual(fastIsItIgnored(visibleFile.fsPath), false, 'Visible file should not be ignored');
    });

    test('fastIsFileIgnored and visibility helpers filter ignored entries', async function() {
        await writeIgnoreFile('test_files/ignored.txt\n');

        const ignoredFile = await createTestFile(['ignored.txt'], 'ignored');
        const visibleFile = await createTestFile(['visible.txt'], 'visible');

        await loadIgnoreFiles(baseDir);

        const firstIgnored = await fastIsFileIgnored(baseDir, [visibleFile.fsPath, ignoredFile.fsPath]);
        assert.strictEqual(firstIgnored, ignoredFile.fsPath, 'fastIsFileIgnored should return the first ignored path');

        const visible = await getVisibleFiles(baseDir, [visibleFile.fsPath, ignoredFile.fsPath]);
        assert.deepStrictEqual(visible, [visibleFile.fsPath], 'getVisibleFiles should return only visible paths');

        const fastVisible = await fastIsTheFilesVisible(baseDir, [visibleFile.fsPath, ignoredFile.fsPath]);
        assert.deepStrictEqual(fastVisible, [visibleFile.fsPath], 'fastIsTheFilesVisible should return only visible paths');
    });

    test('findIgnoredFile locates ignored entries recursively', async function() {
        await writeIgnoreFile('test_files/nested/ignored\n');

        const nestedDir = await createTestDirectory(['nested']);
        const ignoredDir = await createTestDirectory(['nested', 'ignored']);
        await createTestFile(['nested', 'ignored', 'secret.txt'], 'secret');
        await createTestFile(['nested', 'visible.txt'], 'visible');

        await loadIgnoreFiles(baseDir);

        const result = await findIgnoredFile(baseDir, [nestedDir.fsPath]);
        assert.strictEqual(result, ignoredDir.fsPath, 'findIgnoredFile should return the ignored directory');
    });
});


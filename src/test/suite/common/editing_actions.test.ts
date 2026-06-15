import * as assert from 'assert';
import * as vscode from 'vscode';
import { instance, mock, reset } from 'ts-mockito';
import { NEURO } from '@/constants';
import { ActionData } from 'neuro-game-sdk';
import type { RCEContext } from '@/context/rce';
import type { ActionHandlerResult } from '@/utils/neuro_client';
import {
    handleInsertText,
    handleInsertLines,
    handleReplaceText,
    handleDeleteText,
    handleUndo,
    handleRewriteAll,
    handleRewriteLines,
    handleDeleteLines,
} from '@/edit_files';
import { handleSave } from '@/file_operations';
import {
    handleFindText,
    handleHighlightLines,
    handlePlaceCursor,
    handleGetCursor,
} from '@/read_files';
import { createTestFile, checkNoErrorWithTimeout, setupDocument, returnMockFunction } from '@test/test_utils';

const makeContext = (data: ActionData) => ({ data, updateStatus: returnMockFunction() } as unknown as RCEContext);

import { NeuroClient } from 'neuro-game-sdk';

suite('Integration: Editing actions', () => {
    let originalClient: NeuroClient | null = null;
    let mockedClient: NeuroClient;
    let docUri: vscode.Uri;
    const initialContent = ['Alpha', 'Bravo', 'Charlie', 'Delta'].join('\n');

    suiteSetup(async () => {
        // Mock client for sendContext assertions
        originalClient = NEURO.client;
        mockedClient = mock(NeuroClient);
        NEURO.client = instance(mockedClient);

        // Create and open a test document
        docUri = await createTestFile('editing_actions.txt', initialContent);
        const document = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(document, { preview: false });

        // Set cursor context style to both for the test suite
        const config = vscode.workspace.getConfiguration('neuropilot');
        await config.update('cursorPositionContextStyle', 'both', vscode.ConfigurationTarget.Workspace);

        // Initialize decoration types and output channel expected by editing handlers
        NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffAddedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffRemovedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffModifiedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.highlightDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.outputChannel = vscode.window.createOutputChannel('Neuropilot Test');
    });

    setup(async () => {
        // Ensure every test starts from the same content and cursor position (2:1)
        await setupDocument(initialContent, { cursorPosition: new vscode.Position(1, 0) });
    });

    suiteTeardown(() => {
        // Restore client
        NEURO.client = originalClient;
        originalClient = null;
    });

    teardown(() => {
        // Reset verifications between tests
        reset(mockedClient);
    });

    test('place_cursor (absolute)', () => {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'place_cursor', params: { line: 4, column: 3, type: 'absolute' } };

        // === Act ===
        const result = handlePlaceCursor(makeContext(actionData)) as ActionHandlerResult;

        // === Assert ===
        assert.ok(result?.message?.includes('(4:3)'));
    });

    test('get_cursor returns current position and context', () => {
        // === Act ===        
        const result = handleGetCursor() as ActionHandlerResult;

        // === Assert ===
        assert.ok(result?.message?.includes('2:1'));
    });

    test('place_cursor (relative) moves from current position and can be restored', () => {
        // Move relative by +1 line, +1 column from (2:1) -> (3:2)
        // === Act ===
        const moved = handlePlaceCursor(makeContext({ id: 't', name: 'place_cursor', params: { line: 1, column: 1, type: 'relative' } } as ActionData)) as ActionHandlerResult;

        // === Assert ===
        assert.ok(moved?.message?.includes('(3:2)'));

        // === Act & Assert ===
        const restored = handlePlaceCursor(makeContext({ id: 't', name: 'place_cursor', params: { line: 2, column: 1, type: 'absolute' } } as ActionData)) as ActionHandlerResult;
        assert.ok(restored?.message?.includes('(2:1)'));
    });

    test('insert_text inserts at absolute position', async () => {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'insert_text', params: { text: 'X', position: { line: 2, column: 2, type: 'absolute' } } };

        // === Act ===
        await handleInsertText(makeContext(actionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        const line2 = text.split('\n')[1] ?? '';
        assert.ok(line2.includes('X'));
    });

    test('insert_text defaults to current cursor when no position provided', async () => {
        // === Arrange ===
        reset(mockedClient);

        // === Act ===
        await handleInsertText(makeContext({ id: 't', name: 'insert_text', params: { text: 'Q' } } as ActionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        // Line 2 should now start with 'Q'
        const line2 = text.split('\n')[1] ?? '';
        assert.ok(line2.startsWith('Q'));
    });

    test('insert_text supports relative position', async () => {
        // === Arrange ===
        // Place at start of file, then insert relative
        await setupDocument('Aaa\nBbb\nCcc');
        const ad: ActionData = { id: 't', name: 'insert_text', params: { text: '-', position: { line: 1, column: 2, type: 'relative' } } };

        // === Act ===
        await handleInsertText(makeContext(ad));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        // Should have inserted after moving to line 2, column 3 (0-based 1,2)
        assert.ok(text.includes('Bb-b'));
    });

    test('insert_lines appends lines', async () => {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'insert_lines', params: { text: 'Echo\nFoxtrot', insertUnder: 4 } };

        // === Act ===
        await handleInsertLines(makeContext(actionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('Echo'));
        assert.ok(text.includes('Foxtrot'));
    });

    test('insert_lines inserts beyond EOF by padding newlines', async () => {
        // === Arrange ===
        // Reset to small file
        await setupDocument('A\nB');

        // === Act ===
        await handleInsertLines(makeContext({ id: 't', name: 'insert_lines', params: { text: 'C', insertUnder: 6 } } as ActionData));

        // === Assert ===
        const doc = await vscode.workspace.openTextDocument(docUri);
        const lines = doc.getText().split('\n');
        assert.ok(lines.length >= 6);
        assert.strictEqual(lines[lines.length - 1], 'C');
    });

    test('replace_text single match replaces', async function () {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: 'Alpha', replaceWith: 'A', match: 'firstInFile', useRegex: false } };

        // === Act ===
        await handleReplaceText(makeContext(actionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.startsWith('A\n'));
    });

    test('replace_text supports regex substitution and allInFile', async () => {
        // === Arrange ===
        await setupDocument('foo1\nfoo2\nbar3');
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: '(foo)(\\d)', replaceWith: '$1X', match: 'allInFile', useRegex: true } };

        // === Act ===
        await handleReplaceText(makeContext(actionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['fooX', 'fooX', 'bar3'].join('\n'));
    });

    test('replace_text respects lineRange', async () => {
        // === Arrange ===
        await setupDocument('a\na\na');

        // === Act ===
        await handleReplaceText(makeContext({ id: 't', name: 'replace_text', params: { find: 'a', replaceWith: 'b', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } } as ActionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['a', 'b', 'b'].join('\n'));
    });

    test('delete_text single match deletes', async function () {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'delete_text', params: { find: 'Delta', match: 'firstInFile', useRegex: false } };

        // === Act ===
        await handleDeleteText(makeContext(actionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('Delta'));
    });

    test('delete_text deletes multiple matches and can use lineRange', async function () {
        // === Arrange ===
        // Multiple delete
        await setupDocument('x 1 x 2 x');

        // === Act ===
        await handleDeleteText(makeContext({ id: 't', name: 'delete_text', params: { find: 'x', match: 'allInFile', useRegex: false } } as ActionData));

        // === Assert ===
        // Poll document until content reflects deletions
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.ok(!t.includes('x'));
        }, 5000, 100);
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('x'));

        // === Arrange ===
        // Range-limited delete
        await setupDocument('p\nq\np\nq');

        // === Act ===
        await handleDeleteText(makeContext({ id: 't', name: 'delete_text', params: { find: 'p', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } } as ActionData));
        const expected = ['p', 'q', '', 'q'].join('\n');

        // === Assert ===
        await checkNoErrorWithTimeout(async () => {
            const t = vscode.window.activeTextEditor?.document.getText() ?? '';
            assert.strictEqual(t, expected);
        }, 5000, 100);
        text = vscode.window.activeTextEditor?.document.getText() ?? '';
        const lines = text.split('\n');
        // First line 'p' should remain
        assert.strictEqual(lines[0], 'p');
        // Lines 2-3 should not contain 'p'
        assert.ok(!(lines[1] + lines[2]).includes('p'));
        // Total count of 'p' should be exactly 1
        const pCount = (text.match(/p/g) ?? []).length;
        assert.strictEqual(pCount, 1);
    });

    test('find_text single match returns description string', async () => {
        // === Arrange ===
        await setupDocument('Echo\nZulu');
        const actionData: ActionData = { id: 't', name: 'find_text', params: { find: 'Echo', match: 'firstInFile', useRegex: false, highlight: false } };
        // === Act & Assert ===
        const result = handleFindText(makeContext(actionData)) as ActionHandlerResult;
        assert.ok(result?.message?.includes('Echo'));
    });

    test('find_text multiple matches with highlight returns count and lines', async () => {
        // === Arrange ===
        await setupDocument('z\nz\nz');

        // === Act & Assert ===
        const result = handleFindText(makeContext({ id: 't', name: 'find_text', params: { find: 'z', match: 'allInFile', useRegex: false, highlight: true } } as ActionData)) as ActionHandlerResult;
        assert.ok(result?.message?.includes('z'));
    });

    test('undo sends context after reverting last change', async () => {
        // === Arrange ===
        // Capture current content as baseline
        const preText = (await vscode.workspace.openTextDocument(docUri)).getText();
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Z');
        await vscode.workspace.applyEdit(edit);

        // === Act ===
        await handleUndo();

        // === Assert ===
        // Poll until content equals baseline
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.strictEqual(t, preText);
        }, 5000, 100);
    });

    test('save persists document', async () => {
        // === Arrange ===
        await vscode.workspace.openTextDocument(docUri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Y');
        await vscode.workspace.applyEdit(edit);

        // === Act ===
        await handleSave();

        // === Assert ===
        const document = await vscode.workspace.openTextDocument(docUri);
        assert.strictEqual(document.isDirty, false);
    });

    test('rewrite_all replaces all content', async () => {
        // === Arrange ===
        const newContent = ['One', 'Two', 'Three'].join('\n');

        // === Act ===
        await handleRewriteAll(makeContext({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all moves cursor to start of file', async () => {
        // === Arrange ===        
        const newContent = ['X1', 'X2'].join('\n');

        // === Act ===
        await handleRewriteAll(makeContext({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData));

        // === Assert ===
        const cursorInfo = handleGetCursor()! as ActionHandlerResult;
        assert.ok(cursorInfo?.message?.includes('1:1'));
    });

    test('rewrite_all handles empty content', async () => {
        // === Arrange ===
        const newContent = '';

        // === Act ===
        await handleRewriteAll(makeContext({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all handles large content', async () => {
        // === Arrange ===
        const newContent = Array.from({ length: 500 }, (_, i) => `L ${i + 1}`).join('\n');

        // === Act ===
        await handleRewriteAll(makeContext({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData));

        // === Assert ===
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
        assert.strictEqual(text.split('\n').length, 500);
    });

    test('rewrite_lines replaces a range; delete_lines removes a range', async () => {
        // === Arrange ===
        await setupDocument('L1\nL2\nL3\nL4\nL5');

        // === Act ===
        await handleRewriteLines(makeContext({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\nY' } } as ActionData));

        // === Assert ===
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('L1'));
        assert.ok(text.includes('X'));
        assert.ok(text.includes('Y'));

        reset(mockedClient);

        // === Act ===
        await handleDeleteLines(makeContext({ id: 't', name: 'delete_lines', params: { startLine: 4, endLine: 4 } } as ActionData));

        // === Assert ===
        text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('L4'));
    });

    test('rewrite_lines cursor position depends on trailing newline', async () => {
        // With trailing newline: logicalLines = 1, cursor ends on line 2
        // === Act ===
        await handleRewriteLines(makeContext({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\n' } } as ActionData));

        // === Assert ===
        let info = handleGetCursor()! as ActionHandlerResult;
        assert.ok(info?.message?.includes('2:'));

        // Without trailing newline: logicalLines = 2, cursor ends on line 3
        // === Arrange ===
        reset(mockedClient);

        // === Act ===
        await handleRewriteLines(makeContext({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'Y\nZ' } } as ActionData));

        // === Assert ===
        info = handleGetCursor()! as ActionHandlerResult;
        assert.ok(info?.message?.includes('3:'));
    });

    test('delete_lines from first line moves cursor to start of file', async () => {
        // === Arrange ===
        await setupDocument('A\nB\nC', { cursorPosition: new vscode.Position(2, 0) }); // Cursor at (3:1)

        // === Act ===
        await handleDeleteLines(makeContext({ id: 't', name: 'delete_lines', params: { startLine: 1, endLine: 2 } } as ActionData));

        // === Assert ===
        const info = handleGetCursor()! as ActionHandlerResult;
        assert.ok(info?.message?.includes('1:1'));
    });

    test('highlight_lines returns description string', async function () {
        // === Arrange ===
        // Ensure at least two lines exist for the highlight range
        await setupDocument('H1\nH2');
        // === Act & Assert ===
        const result = handleHighlightLines(makeContext({ id: 't', name: 'highlight_lines', params: { startLine: 1, endLine: 2 } } as ActionData)) as ActionHandlerResult;
        assert.ok(result?.message?.includes('1-2'));
    });
});



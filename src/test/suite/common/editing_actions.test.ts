import * as assert from 'assert';
import * as vscode from 'vscode';
import { anything, capture, instance, mock, reset, verify } from 'ts-mockito';
import { NEURO } from '@/constants';
import { ActionData } from '@/neuro_client_helper';
import {
    handlePlaceCursor,
    handleGetCursor,
    handleGetContent,
    handleInsertText,
    handleInsertLines,
    handleReplaceText,
    handleDeleteText,
    handleFindText,
    handleUndo,
    handleSave,
    handleRewriteAll,
    handleRewriteLines,
    handleDeleteLines,
    handleHighlightLines,
} from '@/editing';
import { createTestFile, checkNoErrorWithTimeout, setupDocument } from '../../test_utils';

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
        const result = handlePlaceCursor(actionData);

        // === Assert ===
        assert.ok(result && result.includes('(4:3)'));
    });

    test('get_cursor returns current position and context', () => {
        // === Act ===        
        const result = handleGetCursor({ id: 't', name: 'get_cursor' });

        // === Assert ===
        assert.ok(result && result.includes('2:1'));
    });

    test('place_cursor (relative) moves from current position and can be restored', () => {
        // Move relative by +1 line, +1 column from (2:1) -> (3:2)
        // === Act ===
        const moved = handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 1, column: 1, type: 'relative' } });

        // === Assert ===
        assert.ok(moved && moved.includes('(3:2)'));

        // === Act & Assert ===
        const restored = handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 2, column: 1, type: 'absolute' } });
        assert.ok(restored && restored.includes('(2:1)'));
    });

    test('get_content returns full file content context', () => {
        // === Act ===
        const result = handleGetContent();

        // === Assert ===
        assert.ok(result.includes('Alpha'));
        assert.ok(result.includes('Delta'));
    });

    test('insert_text inserts at absolute position and sends context', async () => {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'insert_text', params: { text: 'X', position: { line: 2, column: 2, type: 'absolute' } } };

        // === Act ===
        handleInsertText(actionData);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const [ctx] = capture(mockedClient.sendContext).last();
        assert.ok(typeof ctx === 'string');
    });

    test('insert_text defaults to current cursor when no position provided', async () => {
        // === Arrange ===
        reset(mockedClient);

        // === Act ===
        handleInsertText({ id: 't', name: 'insert_text', params: { text: 'Q' } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
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
        handleInsertText(ad);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        // Should have inserted after moving to line 2, column 3 (0-based 1,2)
        assert.ok(text.includes('Bb-b'));
    });

    test('insert_lines appends lines and sends context', async () => {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'insert_lines', params: { text: 'Echo\nFoxtrot', insertUnder: 4 } };

        // === Act ===
        handleInsertLines(actionData);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('Echo'));
        assert.ok(text.includes('Foxtrot'));
    });

    test('insert_lines inserts beyond EOF by padding newlines', async () => {
        // === Arrange ===
        // Reset to small file
        await setupDocument('A\nB');

        // === Act ===
        handleInsertLines({ id: 't', name: 'insert_lines', params: { text: 'C', insertUnder: 6 } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const doc = await vscode.workspace.openTextDocument(docUri);
        const lines = doc.getText().split('\n');
        assert.ok(lines.length >= 6);
        assert.strictEqual(lines[lines.length - 1], 'C');
    });

    test('replace_text single match replaces and sends context', async function () {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: 'Alpha', replaceWith: 'A', match: 'firstInFile', useRegex: false } };

        // === Act ===
        handleReplaceText(actionData);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.startsWith('A\n'));
    });

    test('replace_text supports regex substitution and allInFile', async () => {
        // === Arrange ===
        await setupDocument('foo1\nfoo2\nbar3');
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: '(foo)(\\d)', replaceWith: '$1X', match: 'allInFile', useRegex: true } };

        // === Act ===
        handleReplaceText(actionData);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['fooX', 'fooX', 'bar3'].join('\n'));
    });

    test('replace_text respects lineRange', async () => {
        // === Arrange ===
        await setupDocument('a\na\na');

        // === Act ===
        handleReplaceText({ id: 't', name: 'replace_text', params: { find: 'a', replaceWith: 'b', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['a', 'b', 'b'].join('\n'));
    });

    test('delete_text single match deletes and sends context', async function () {
        // === Arrange ===
        const actionData: ActionData = { id: 't', name: 'delete_text', params: { find: 'Delta', match: 'firstInFile', useRegex: false } };

        // === Act ===
        handleDeleteText(actionData);

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('Delta'));
    });

    test('delete_text deletes multiple matches and can use lineRange', async function () {
        // === Arrange ===
        // Multiple delete
        await setupDocument('x 1 x 2 x');

        // === Act ===
        handleDeleteText({ id: 't', name: 'delete_text', params: { find: 'x', match: 'allInFile', useRegex: false } });

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
        handleDeleteText({ id: 't', name: 'delete_text', params: { find: 'p', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } });
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
        const result = handleFindText(actionData);
        assert.ok(typeof result === 'string' && result.includes('Echo'));
    });

    test('find_text multiple matches with highlight returns count and lines', async () => {
        // === Arrange ===
        await setupDocument('z\nz\nz');

        // === Act & Assert ===
        const result = handleFindText({ id: 't', name: 'find_text', params: { find: 'z', match: 'allInFile', useRegex: false, highlight: true } });
        assert.ok(typeof result === 'string' && result.includes('z'));
    });

    test('undo sends context after reverting last change', async () => {
        // === Arrange ===
        // Capture current content as baseline
        const preText = (await vscode.workspace.openTextDocument(docUri)).getText();
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Z');
        await vscode.workspace.applyEdit(edit);

        // === Act ===
        handleUndo({ id: 't', name: 'undo' });

        // === Assert ===
        // Poll until content equals baseline
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.strictEqual(t, preText);
        }, 5000, 100);
    });

    test('save sends context', async () => {
        // === Arrange ===
        await vscode.workspace.openTextDocument(docUri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Y');
        await vscode.workspace.applyEdit(edit);

        // === Act ===
        handleSave({ id: 't', name: 'save' });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything(), anything())).once(); }, 5000, 100);
    });

    test('rewrite_all replaces all content and sends context', async () => {
        // === Arrange ===
        const newContent = ['One', 'Two', 'Three'].join('\n');

        // === Act ===
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all moves cursor to start of file', async () => {
        // === Arrange ===        
        const newContent = ['X1', 'X2'].join('\n');

        // === Act ===
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const cursorInfo = handleGetCursor({ id: 't', name: 'get_cursor' })!;
        assert.ok(cursorInfo.includes('1:1'));
    });

    test('rewrite_all handles empty content', async () => {
        // === Arrange ===
        const newContent = '';

        // === Act ===
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all handles large content', async () => {
        // === Arrange ===
        const newContent = Array.from({ length: 500 }, (_, i) => `L ${i + 1}`).join('\n');

        // === Act ===
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
        assert.strictEqual(text.split('\n').length, 500);
    });

    test('rewrite_lines replaces a range and sends context; delete_lines removes a range and sends context', async () => {
        // === Arrange ===
        await setupDocument('L1\nL2\nL3\nL4\nL5');

        // === Act ===
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\nY' } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('L1'));
        assert.ok(text.includes('X'));
        assert.ok(text.includes('Y'));

        reset(mockedClient);

        // === Act ===
        handleDeleteLines({ id: 't', name: 'delete_lines', params: { startLine: 4, endLine: 4 } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('L4'));
    });

    test('rewrite_lines cursor position depends on trailing newline', async () => {
        // With trailing newline: logicalLines = 1, cursor ends on line 2
        // === Act ===
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\n' } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        let info = handleGetCursor({ id: 't', name: 'get_cursor' })!;
        assert.ok(info.includes('2:'));

        // Without trailing newline: logicalLines = 2, cursor ends on line 3
        // === Arrange ===
        reset(mockedClient);

        // === Act ===
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'Y\nZ' } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        info = handleGetCursor({ id: 't', name: 'get_cursor' })!;
        assert.ok(info.includes('3:'));
    });

    test('delete_lines from first line moves cursor to start of file', async () => {
        // === Arrange ===
        await setupDocument('A\nB\nC', { cursorPosition: new vscode.Position(2, 0) }); // Cursor at (3:1)

        // === Act ===
        handleDeleteLines({ id: 't', name: 'delete_lines', params: { startLine: 1, endLine: 2 } });

        // === Assert ===
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const info = handleGetCursor({ id: 't', name: 'get_cursor' })!;
        assert.ok(info.includes('1:1'));
    });

    test('highlight_lines returns description string', async function () {
        // === Arrange ===
        // Ensure at least two lines exist for the highlight range
        await setupDocument('H1\nH2');
        // === Act & Assert ===
        const result = handleHighlightLines({ id: 't', name: 'highlight_lines', params: { startLine: 1, endLine: 2 } });
        assert.ok(typeof result === 'string' && result.includes('1-2'));
    });
});



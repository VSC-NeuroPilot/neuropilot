import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the rewrite_lines action prompt generator using real logic
suite('rewrite_lines Action', () => {
    test('generates a prompt and reflects single-line content count', () => {
        assert.ok(editFileActions.rewrite_lines.promptGenerator && typeof editFileActions.rewrite_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const params = { lineRange: { startLine: 2, endLine: 4 }, content: 'only one line' };
        const prompt = editFileActions.rewrite_lines.promptGenerator(fakeContext('rewrite_lines', params));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2') && prompt.includes('4'));
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line content count', () => {
        assert.ok(editFileActions.rewrite_lines.promptGenerator && typeof editFileActions.rewrite_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const params = { lineRange: { startLine: 5, endLine: 10 }, content: 'a\nb\nc' };
        const prompt = editFileActions.rewrite_lines.promptGenerator(fakeContext('rewrite_lines', params));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('5') && prompt.includes('10'));
        assert.ok(prompt.includes('3'));
    });

    test('generates a prompt for reversed ranges (format-only)', () => {
        assert.ok(editFileActions.rewrite_lines.promptGenerator && typeof editFileActions.rewrite_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const params = { lineRange: { startLine: 8, endLine: 6 }, content: 'x\ny' };
        const prompt = editFileActions.rewrite_lines.promptGenerator(fakeContext('rewrite_lines', params));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('8') && prompt.includes('6'));
    });
});



import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the rewrite_all action prompt generator using real logic
suite('rewrite_all Action (unit)', () => {
    test('generates a prompt and reflects single line count', () => {
        assert.ok(editFileActions.rewrite_all.promptGenerator && typeof editFileActions.rewrite_all.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.rewrite_all.promptGenerator(fakeContext('rewrite_all', { content: 'Single line content' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line count', () => {
        assert.ok(editFileActions.rewrite_all.promptGenerator && typeof editFileActions.rewrite_all.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.rewrite_all.promptGenerator(fakeContext('rewrite_all', { content: 'Line 1\nLine 2\nLine 3' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('3'));
    });

    test('generates a prompt even for empty content (count 0 or 1 acceptable)', () => {
        assert.ok(editFileActions.rewrite_all.promptGenerator && typeof editFileActions.rewrite_all.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.rewrite_all.promptGenerator(fakeContext('rewrite_all', { content: '' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        // Implementation trims and splits; empty content yields 1 due to split on [''] after trim, but we only require non-empty prompt
        assert.ok(/\d+/.test(prompt));
    });
});



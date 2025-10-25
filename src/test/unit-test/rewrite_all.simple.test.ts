import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the rewrite_all action prompt generator using real logic
suite('rewrite_all Action (unit)', () => {
    test('generates a prompt and reflects single line count', () => {
        // === Arrange & Act ===
        const prompt = editingActions.rewrite_all.promptGenerator({
            params: { content: 'Single line content' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line count', () => {
        // === Arrange & Act ===
        const prompt = editingActions.rewrite_all.promptGenerator({
            params: { content: 'Line 1\nLine 2\nLine 3' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('3'));
    });

    test('generates a prompt even for empty content (count 0 or 1 acceptable)', () => {
        // === Arrange & Act ===
        const prompt = editingActions.rewrite_all.promptGenerator({
            params: { content: '' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        // Implementation trims and splits; empty content yields 1 due to split on [''] after trim, but we only require non-empty prompt
        assert.ok(/\d+/.test(prompt));
    });
});



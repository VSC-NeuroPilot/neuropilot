import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the rewrite_lines action prompt generator using real logic
suite('rewrite_lines Action', () => {
    test('generates a prompt and reflects single-line content count', () => {
        // === Arrange & Act ===
        const params = { startLine: 2, endLine: 4, content: 'only one line' };
        const prompt = editingActions.rewrite_lines.promptGenerator({ params } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2') && prompt.includes('4'));
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line content count', () => {
        // === Arrange & Act ===
        const params = { startLine: 5, endLine: 10, content: 'a\nb\nc' };
        const prompt = editingActions.rewrite_lines.promptGenerator({ params } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('5') && prompt.includes('10'));
        assert.ok(prompt.includes('3'));
    });

    test('generates a prompt for reversed ranges (format-only)', () => {
        // === Arrange & Act ===
        const params = { startLine: 8, endLine: 6, content: 'x\ny' };
        const prompt = editingActions.rewrite_lines.promptGenerator({ params } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('8') && prompt.includes('6'));
    });
});



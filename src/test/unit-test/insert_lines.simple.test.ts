import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the insert_lines action prompt generator using real logic
suite('insert_lines Action', () => {
    test('generates a prompt and reflects line count without insertUnder', () => {
        // === Arrange & Act ===
        const prompt = editingActions.insert_lines.promptGenerator({
            params: { text: 'a\nb' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2'));
    });

    test('generates a prompt including insertUnder when provided', () => {
        // === Arrange & Act ===
        const prompt = editingActions.insert_lines.promptGenerator({
            params: { text: 'one line', insertUnder: 7 },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('7'));
    });
});



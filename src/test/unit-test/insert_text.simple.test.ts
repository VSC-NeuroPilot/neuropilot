import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the insert_text action prompt generator using real logic
suite('insert_text Action', () => {
    test('generates a prompt and reflects single line count', () => {
        // === Arrange & Act ===
        const prompt = editingActions.insert_text.promptGenerator({
            params: { text: 'hello world' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line count', () => {
        // === Arrange & Act ===
        const prompt = editingActions.insert_text.promptGenerator({
            params: { text: 'a\nb\nc' },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('3'));
    });
});



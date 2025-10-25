import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the highlight_lines action prompt generator using real logic
suite('highlight_lines Action', () => {
    test('generates a prompt and includes start and end', () => {
        // === Arrange & Act ===
        const prompt = editingActions.highlight_lines.promptGenerator({
            params: { startLine: 1, endLine: 3 },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('3'));
    });
});



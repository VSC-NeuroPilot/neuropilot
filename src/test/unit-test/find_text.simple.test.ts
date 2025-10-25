import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the find_text action prompt generator using real logic
suite('find_text Action', () => {
    test('generates a prompt and includes escaped find when useRegex is true', () => {
        // === Arrange & Act ===
        const prompt = editingActions.find_text.promptGenerator({
            params: { find: 'foo(bar)', useRegex: true },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('foo\\(bar\\)'));
    });

    test('generates a prompt and includes raw find when useRegex is false', () => {
        // === Arrange & Act ===
        const prompt = editingActions.find_text.promptGenerator({
            params: { find: 'baz', useRegex: false },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('baz'));
    });
});



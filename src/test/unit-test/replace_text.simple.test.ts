import * as assert from 'assert';
import { editingActions } from '@/editing';
import { ActionData } from '@/neuro_client_helper';

// Tests for the replace_text action prompt generator using real logic
suite('replace_text Action', () => {
    test('generates a prompt and includes escaped find when useRegex is true', () => {
        // === Arrange & Act ===
        const prompt = editingActions.replace_text.promptGenerator({
            params: { find: 'a+b', replaceWith: 'x', useRegex: true },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a\\+b'));
        assert.ok(prompt.includes('x'));
    });

    test('generates a prompt and includes raw find and replacement when useRegex is false', () => {
        // === Arrange & Act ===
        const prompt = editingActions.replace_text.promptGenerator({
            params: { find: 'hello', replaceWith: 'world', useRegex: false },
        } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('hello'));
        assert.ok(prompt.includes('world'));
    });
});



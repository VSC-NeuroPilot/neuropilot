import * as assert from 'assert';
import { editingActions } from '@/editing';
import type { RCEContext } from '@/context/rce';

// Tests for the delete_text action prompt generator using real logic
suite('delete_text Action', () => {
    test('generates a prompt and includes raw find when useRegex is true', () => {
        // === Arrange & Act ===
        const prompt = editingActions.delete_text.promptGenerator({
            data: { params: { find: 'a+b', useRegex: true } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a+b'));
    });

    test('generates a prompt and includes raw find when useRegex is false', () => {
        // === Arrange ===
        const prompt = editingActions.delete_text.promptGenerator({
            data: { params: { find: 'hello', useRegex: false } },
        } as RCEContext);

        // === Act ===

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('hello'));
    });
});



import * as assert from 'assert';
import { editingActions } from '@/editing';
import type { RCEContext } from '@/context/rce';

// Tests for the find_text action prompt generator using real logic
suite('find_text Action', () => {
    test('generates a prompt and includes raw find when useRegex is true', () => {
        // === Arrange & Act ===
        const prompt = editingActions.find_text.promptGenerator({
            data: { params: { find: 'foo(bar)', useRegex: true } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('foo(bar)'));
    });

    test('generates a prompt and includes raw find when useRegex is false', () => {
        // === Arrange & Act ===
        const prompt = editingActions.find_text.promptGenerator({
            data: { params: { find: 'baz', useRegex: false } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('baz'));
    });
});



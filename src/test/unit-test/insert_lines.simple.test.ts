import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import type { RCEContext } from '@/context/rce';

// Tests for the insert_lines action prompt generator using real logic
suite('insert_lines Action', () => {
    test('generates a prompt and reflects line count without insertUnder', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.insert_lines.promptGenerator({
            data: { params: { text: 'a\nb' } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2'));
    });

    test('generates a prompt including insertUnder when provided', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.insert_lines.promptGenerator({
            data: { params: { text: 'one line', insertUnder: 7 } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('7'));
    });
});



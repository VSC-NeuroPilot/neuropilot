import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import type { RCEContext } from '@/context/rce';

// Tests for the insert_text action prompt generator using real logic
suite('insert_text Action', () => {
    test('generates a prompt and reflects single line count', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.insert_text.promptGenerator({
            data: { params: { text: 'hello world' } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line count', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.insert_text.promptGenerator({
            data: { params: { text: 'a\nb\nc' } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('3'));
    });
});



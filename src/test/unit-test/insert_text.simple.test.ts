import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the insert_text action prompt generator using real logic
suite('insert_text Action', () => {
    test('generates a prompt and reflects single line count', () => {
        assert.ok(editFileActions.insert_text.promptGenerator && typeof editFileActions.insert_text.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.insert_text.promptGenerator(fakeContext('insert_text', { text: 'hello world' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
    });

    test('generates a prompt and reflects multi-line count', () => {
        assert.ok(editFileActions.insert_text.promptGenerator && typeof editFileActions.insert_text.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.insert_text.promptGenerator(fakeContext('insert_text', { text: 'a\nb\nc' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('3'));
    });
});



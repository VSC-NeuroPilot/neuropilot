import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the insert_lines action prompt generator using real logic
suite('insert_lines Action', () => {
    test('generates a prompt and reflects line count without insertUnder', () => {
        assert.ok(editFileActions.insert_lines.promptGenerator && typeof editFileActions.insert_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.insert_lines.promptGenerator(fakeContext('insert_lines', { text: 'a\nb' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2'));
    });

    test('generates a prompt including insertUnder when provided', () => {
        assert.ok(editFileActions.insert_lines.promptGenerator && typeof editFileActions.insert_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.insert_lines.promptGenerator(fakeContext('insert_lines', { text: 'one line', insertUnder: 7 }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('7'));
    });
});



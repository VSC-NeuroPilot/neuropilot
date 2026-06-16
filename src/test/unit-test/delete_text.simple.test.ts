import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the delete_text action prompt generator using real logic
suite('delete_text Action', () => {
    test('generates a prompt and includes raw find when useRegex is true', () => {
        assert.ok(editFileActions.delete_text.promptGenerator && typeof editFileActions.delete_text.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.delete_text.promptGenerator(fakeContext('delete_text', { find: 'a+b', match: 'firstInFile', useRegex: true }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a+b'));
    });

    test('generates a prompt and includes raw find when useRegex is false', () => {
        assert.ok(editFileActions.delete_text.promptGenerator && typeof editFileActions.delete_text.promptGenerator !== 'string');
        // === Arrange ===
        const prompt = editFileActions.delete_text.promptGenerator(fakeContext('delete_text', { find: 'hello', match: 'firstInFile', useRegex: false }));

        // === Act ===

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('hello'));
    });
});



import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the replace_text action prompt generator using real logic
suite('replace_text Action', () => {
    test('generates a prompt and includes raw find when useRegex is true', () => {
        assert.ok(editFileActions.replace_text.promptGenerator && typeof editFileActions.replace_text.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.replace_text.promptGenerator(fakeContext('replace_text', { find: 'a+b', replaceWith: 'x', match: 'firstInFile', useRegex: true }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a+b'));
        assert.ok(prompt.includes('x'));
    });

    test('generates a prompt and includes raw find and replacement when useRegex is false', () => {
        assert.ok(editFileActions.replace_text.promptGenerator && typeof editFileActions.replace_text.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.replace_text.promptGenerator(fakeContext('replace_text', { find: 'hello', replaceWith: 'world', match: 'firstInFile', useRegex: false }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('hello'));
        assert.ok(prompt.includes('world'));
    });
});



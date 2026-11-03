import * as assert from 'assert';
import { readFileActions } from '@/read_files';
import { fakeContext } from '@test/test_utils';

// Tests for the find_text action prompt generator using real logic
suite('find_and_replace Action', () => {
    test('generates a prompt and includes raw find when useRegex is true', () => {
        assert.ok(readFileActions.find_and_replace.promptGenerator && typeof readFileActions.find_and_replace.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.find_and_replace.promptGenerator(fakeContext('find_and_replace', { find: 'foo(bar)', match: 'firstInFile', useRegex: true }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('foo(bar)'));
    });

    test('generates a prompt and includes raw find when useRegex is false', () => {
        assert.ok(readFileActions.find_and_replace.promptGenerator && typeof readFileActions.find_and_replace.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.find_and_replace.promptGenerator(fakeContext('find_and_replace', { find: 'baz', match: 'firstInFile', useRegex: false }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('baz'));
    });
});



import * as assert from 'assert';
import { readFileActions } from '@/read_files';
import { fakeContext } from '@test/test_utils';

// Tests for the highlight_lines action prompt generator using real logic
suite('highlight_lines Action', () => {
    test('generates a prompt and includes start and end', () => {
        assert.ok(readFileActions.highlight_lines.promptGenerator && typeof readFileActions.highlight_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.highlight_lines.promptGenerator(fakeContext('highlight_lines', { startLine: 1, endLine: 3 }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('3'));
    });
});



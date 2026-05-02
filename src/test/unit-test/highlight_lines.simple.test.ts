import * as assert from 'assert';
import { readFileActions } from '@/read_files';
import type { RCEContext } from '@/context/rce';

// Tests for the highlight_lines action prompt generator using real logic
suite('highlight_lines Action', () => {
    test('generates a prompt and includes start and end', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.highlight_lines.promptGenerator({
            data: { params: { startLine: 1, endLine: 3 } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('1'));
        assert.ok(prompt.includes('3'));
    });
});



import * as assert from 'assert';
import { editFileActions } from '@/edit_files';
import type { RCEContext } from '@/context/rce';

// Tests for the delete_lines action prompt generator using real logic
suite('delete_lines Action', () => {
    test('generates a prompt and includes start and end for a normal range', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator({
            data: { params: { startLine: 3, endLine: 7 } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('3'), 'prompt should include the start line');
        assert.ok(prompt.includes('7'), 'prompt should include the end line');
    });

    test('generates a prompt and includes the single line when start=end', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator({
            data: { params: { startLine: 5, endLine: 5 } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('5'), 'prompt should include the line number');
    });

    test('generates a prompt even for reversed ranges (format-only responsibility)', () => {
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator({
            data: { params: { startLine: 7, endLine: 3 } },
        } as RCEContext);
        // Prompt generator formats only; validation handles correctness elsewhere        

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('7') && prompt.includes('3'), 'prompt should include both provided numbers');
    });
});



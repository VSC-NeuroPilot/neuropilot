import assert from 'assert';
import { editFileActions } from '@/edit_files';
import { fakeContext } from '@test/test_utils';

// Tests for the delete_lines action prompt generator using real logic
suite('delete_lines Action', () => {
    test('generates a prompt and includes start and end for a normal range', () => {
        assert.ok(editFileActions.delete_lines.promptGenerator && typeof editFileActions.delete_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator(fakeContext('delete_lines', { startLine: 3, endLine: 7 }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('3'), 'prompt should include the start line');
        assert.ok(prompt.includes('7'), 'prompt should include the end line');
    });

    test('generates a prompt and includes the single line when start=end', () => {
        assert.ok(editFileActions.delete_lines.promptGenerator && typeof editFileActions.delete_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator(fakeContext('delete_lines', { startLine: 5, endLine: 5 }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('5'), 'prompt should include the line number');
    });

    test('generates a prompt even for reversed ranges (format-only responsibility)', () => {
        assert.ok(editFileActions.delete_lines.promptGenerator && typeof editFileActions.delete_lines.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = editFileActions.delete_lines.promptGenerator(fakeContext('delete_lines', { startLine: 7, endLine: 3 }));
        // Prompt generator formats only; validation handles correctness elsewhere        

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be a non-empty string');
        assert.ok(prompt.includes('7') && prompt.includes('3'), 'prompt should include both provided numbers');
    });
});



import * as assert from 'assert';
import { readFileActions } from '@/read_files';
import { fakeContext } from '@test/test_utils';

// Tests for the place_cursor action prompt generator using real logic
suite('place_cursor Action', () => {
    test('generates a prompt for absolute position including line and column', () => {
        assert.ok(readFileActions.move_cursor_position.promptGenerator && typeof readFileActions.move_cursor_position.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.move_cursor_position.promptGenerator(fakeContext('move_cursor_position', { line: 10, column: 5, type: 'absolute' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('10'));
        assert.ok(prompt.includes('5'));
    });

    test('generates a prompt for relative position including deltas', () => {
        assert.ok(readFileActions.move_cursor_position.promptGenerator && typeof readFileActions.move_cursor_position.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = readFileActions.move_cursor_position.promptGenerator(fakeContext('move_cursor_position', { line: 2, column: -1, type: 'relative' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2'));
        assert.ok(prompt.includes('-1'));
    });
});



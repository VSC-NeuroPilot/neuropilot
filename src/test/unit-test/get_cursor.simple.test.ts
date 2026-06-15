import * as assert from 'assert';
import { readFileActions } from '@/read_files';

// Test for the get_cursor action prompt generator using real logic
suite('get_cursor Action', () => {
    test('returns a non-empty fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.get_cursor_position.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});



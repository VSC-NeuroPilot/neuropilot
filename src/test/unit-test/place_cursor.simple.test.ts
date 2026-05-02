import * as assert from 'assert';
import { readFileActions } from '@/read_files';
import type { RCEContext } from '@/context/rce';

// Tests for the place_cursor action prompt generator using real logic
suite('place_cursor Action', () => {
    test('generates a prompt for absolute position including line and column', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.move_cursor_position.promptGenerator({
            data: { params: { line: 10, column: 5, type: 'absolute' } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('10'));
        assert.ok(prompt.includes('5'));
    });

    test('generates a prompt for relative position including deltas', () => {
        // === Arrange & Act ===
        const prompt = readFileActions.move_cursor_position.promptGenerator({
            data: { params: { line: 2, column: -1, type: 'relative' } },
        } as RCEContext);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('2'));
        assert.ok(prompt.includes('-1'));
    });
});



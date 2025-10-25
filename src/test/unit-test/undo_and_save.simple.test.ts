import * as assert from 'assert';
import { editingActions } from '@/editing';

// Tests for the undo and save action prompt generators using real logic
suite('undo/save Actions', () => {
    test('undo has non-empty fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = editingActions.undo.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('save has non-empty fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = editingActions.save.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});



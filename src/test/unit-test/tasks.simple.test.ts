import * as assert from 'assert';
import { taskHandlers } from '@/tasks';

// Tests for tasks action prompt generators using real logic
suite('tasks Actions', () => {
    test('terminate_task fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = taskHandlers.terminate_task.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});




import * as assert from 'assert';
import { cancelRequestAction } from '@/rce';

// Tests for RCE action prompt generators using real logic
suite('rce Actions', () => {
    test('cancel_request has empty prompt', () => {
        // === Arrange & Act ===
        const prompt = (cancelRequestAction.promptGenerator as () => string)();

        // === Assert ===
        assert.ok(typeof prompt === 'string');
        assert.strictEqual(prompt.length, 0);
    });
});




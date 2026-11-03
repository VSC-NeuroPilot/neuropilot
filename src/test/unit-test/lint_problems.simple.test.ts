import * as assert from 'assert';
import { lintActions } from '@/lint_problems';
import { fakeContext } from '@test/test_utils';

// Tests for lint action prompt generators using real logic with loose checks
suite('lint Actions', () => {
    test('get_lint_problems file fixed prompt', () => {
        assert.ok(lintActions.get_lint_problems.promptGenerator && typeof lintActions.get_lint_problems.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = lintActions.get_lint_problems.promptGenerator(fakeContext('get_lint_problems', { path: 'src/a.ts' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/a.ts'));
    });

    test('get_lint_problems folder fixed prompt', () => {
        assert.ok(lintActions.get_lint_problems.promptGenerator && typeof lintActions.get_lint_problems.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = lintActions.get_lint_problems.promptGenerator(fakeContext('get_lint_problems', { path: 'src', recursive: 'true' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src'));
    });

    test('get_lint_problems workspace fixed prompt', () => {
        assert.ok(lintActions.get_lint_problems.promptGenerator && typeof lintActions.get_lint_problems.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = lintActions.get_lint_problems.promptGenerator(fakeContext('get_lint_problems', {}));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});




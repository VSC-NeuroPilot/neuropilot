import * as assert from 'assert';
import { lintActions } from '@/lint_problems';
import { fakeContext } from '@test/test_utils';

// Tests for lint action prompt generators using real logic with loose checks
suite('lint Actions', () => {
    test('get_file_lint_problems formats file', () => {
        assert.ok(lintActions.get_file_lint_problems.promptGenerator && typeof lintActions.get_file_lint_problems.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = lintActions.get_file_lint_problems.promptGenerator(fakeContext('get_file_lint_problems', { file: 'src/a.ts' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/a.ts'));
    });

    test('get_folder_lint_problems formats folder', () => {
        assert.ok(lintActions.get_folder_lint_problems.promptGenerator && typeof lintActions.get_folder_lint_problems.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = lintActions.get_folder_lint_problems.promptGenerator(fakeContext('get_folder_lint_problems', { folder: 'src' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src'));
    });

    test('get_workspace_lint_problems fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = (lintActions.get_workspace_lint_problems.promptGenerator as () => string)();

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});



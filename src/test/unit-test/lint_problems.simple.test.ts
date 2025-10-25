import * as assert from 'assert';
import { lintActions } from '@/lint_problems';
import { ActionData } from '@/neuro_client_helper';

// Tests for lint action prompt generators using real logic with loose checks
suite('lint Actions', () => {
    test('get_file_lint_problems formats file', () => {
        // === Arrange & Act ===
        const prompt = lintActions.get_file_lint_problems.promptGenerator({ params: { file: 'src/a.ts' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/a.ts'));
    });

    test('get_folder_lint_problems formats folder', () => {
        // === Arrange & Act ===
        const prompt = lintActions.get_folder_lint_problems.promptGenerator({ params: { folder: 'src' } } as ActionData);

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



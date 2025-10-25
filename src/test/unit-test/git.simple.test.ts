import * as assert from 'assert';
import { gitActions } from '@/git';
import { ActionData } from '@/neuro_client_helper';

// Tests for Git action prompt generators using real logic with loose checks
suite('git Actions', () => {
    test('init_git_repo has non-empty fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = gitActions.init_git_repo.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('add_file_to_git formats array of files', () => {
        // === Arrange & Act ===
        const prompt = gitActions.add_file_to_git.promptGenerator({ params: { filePath: ['a.ts', 'b.ts'] } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a.ts'));
        assert.ok(prompt.includes('b.ts'));
    });

    test('make_git_commit formats message', () => {
        // === Arrange & Act ===
        const prompt = gitActions.make_git_commit.promptGenerator({ params: { message: 'feat: hello' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('feat: hello'));
    });

    test('merge_to_current_branch formats ref', () => {
        // === Arrange & Act ===
        const prompt = gitActions.merge_to_current_branch.promptGenerator({ params: { ref_to_merge: 'feature' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('feature'));
    });

    test('git_status has non-empty fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_status.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('remove_file_from_git formats array', () => {
        // === Arrange & Act ===
        const prompt = gitActions.remove_file_from_git.promptGenerator({ params: { filePath: ['a.ts'] } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a.ts'));
    });

    test('delete_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.delete_git_branch.promptGenerator({ params: { branchName: 'old' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old'));
    });

    test('switch_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.switch_git_branch.promptGenerator({ params: { branchName: 'main' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('main'));
    });

    test('new_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.new_git_branch.promptGenerator({ params: { branchName: 'feat' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('feat'));
    });

    test('diff_files only filePath', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator({ params: { filePath: 'src/a.ts' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/a.ts'));
    });

    test('diff_files with ref1 only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator({ params: { ref1: 'HEAD~1' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('HEAD~1'));
    });

    test('diff_files between refs and with type', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator({ params: { ref1: 'A', ref2: 'B', diffType: 'diffBetween' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('A'));
        assert.ok(prompt.includes('B'));
        assert.ok(prompt.includes('diffBetween'));
    });

    test('git_log without limit', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_log.promptGenerator({ params: {} } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('git_log with limit', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_log.promptGenerator({ params: { log_limit: 5 } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('5'));
    });

    test('git_blame formats file', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_blame.promptGenerator({ params: { filePath: 'src/x.ts' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/x.ts'));
    });

    test('tag_head formats name and upstream', () => {
        // === Arrange & Act ===
        const prompt = gitActions.tag_head.promptGenerator({ params: { name: 'v1.0.0', upstream: 'origin' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('v1.0.0'));
        assert.ok(prompt.includes('origin'));
    });

    test('delete_tag formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.delete_tag.promptGenerator({ params: { name: 'v1.0.0' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('v1.0.0'));
    });

    test('set_git_config formats key/value', () => {
        // === Arrange & Act ===
        const prompt = gitActions.set_git_config.promptGenerator({ params: { key: 'user.name', value: 'Alice' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('user.name'));
        assert.ok(prompt.includes('Alice'));
    });

    test('get_git_config without key', () => {
        // === Arrange & Act ===
        const prompt = gitActions.get_git_config.promptGenerator({ params: {} } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('get_git_config with key', () => {
        // === Arrange & Act ===
        const prompt = gitActions.get_git_config.promptGenerator({ params: { key: 'core.editor' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('core.editor'));
    });

    test('fetch_git_commits remote+branch', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator({ params: { remoteName: 'origin', branchName: 'main' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('main'));
    });

    test('fetch_git_commits remote only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator({ params: { remoteName: 'origin' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
    });

    test('fetch_git_commits branch only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator({ params: { branchName: 'dev' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('dev'));
    });

    test('pull_git_commits fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = gitActions.pull_git_commits.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('push_git_commits remote+branch', () => {
        // === Arrange & Act ===
        const prompt = gitActions.push_git_commits.promptGenerator({ params: { remoteName: 'origin', branchName: 'main', forcePush: false } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('main'));
    });

    test('push_git_commits remote only forced', () => {
        // === Arrange & Act ===
        const prompt = gitActions.push_git_commits.promptGenerator({ params: { remoteName: 'origin', forcePush: true } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('force'));
        assert.ok(prompt.includes('origin'));
    });

    test('push_git_commits no remote/branch forced', () => {
        // === Arrange & Act ===
        const prompt = gitActions.push_git_commits.promptGenerator({ params: { forcePush: true } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('force'));
    });

    test('add_git_remote formats remote and URL', () => {
        // === Arrange & Act ===
        const prompt = gitActions.add_git_remote.promptGenerator({ params: { remoteName: 'origin', remoteURL: 'git@x:y.git' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('git@x:y.git'));
    });

    test('remove_git_remote formats remote', () => {
        // === Arrange & Act ===
        const prompt = gitActions.remove_git_remote.promptGenerator({ params: { remoteName: 'origin' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
    });

    test('rename_git_remote formats old/new names', () => {
        // === Arrange & Act ===
        const prompt = gitActions.rename_git_remote.promptGenerator({ params: { oldRemoteName: 'origin', newRemoteName: 'upstream' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('upstream'));
    });

    test('abort_merge fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = gitActions.abort_merge.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});



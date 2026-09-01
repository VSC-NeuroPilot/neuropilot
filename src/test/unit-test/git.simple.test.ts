import * as assert from 'assert';
import { gitActions } from '@/git';
import type { RCEContext } from '@/context/rce';

const makeContext = (params: Record<string, unknown>) => ({ data: { params } }) as RCEContext;

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
        const prompt = gitActions.add_file_to_git.promptGenerator(makeContext({ filePath: ['a.ts', 'b.ts'] }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a.ts'));
        assert.ok(prompt.includes('b.ts'));
    });

    test('make_git_commit formats message', () => {
        // === Arrange & Act ===
        const prompt = gitActions.make_git_commit.promptGenerator(makeContext({ message: 'feat: hello' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('feat: hello'));
    });

    test('merge_to_current_branch formats ref', () => {
        // === Arrange & Act ===
        const prompt = gitActions.merge_to_current_branch.promptGenerator(makeContext({ ref_to_merge: 'feature' }));

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
        const prompt = gitActions.remove_file_from_git.promptGenerator(makeContext({ filePath: ['a.ts'] }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('a.ts'));
    });

    test('delete_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.delete_git_branch.promptGenerator(makeContext({ branchName: 'old' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old'));
    });

    test('switch_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.switch_git_branch.promptGenerator(makeContext({ branchName: 'main' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('main'));
    });

    test('new_git_branch formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.new_git_branch.promptGenerator(makeContext({ branchName: 'feat' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('feat'));
    });

    test('diff_files only filePath', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator(makeContext({ filePath: 'src/a.ts' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/a.ts'));
    });

    test('diff_files with ref1 only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator(makeContext({ ref1: 'HEAD~1' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('HEAD~1'));
    });

    test('diff_files between refs and with type', () => {
        // === Arrange & Act ===
        const prompt = gitActions.diff_files.promptGenerator(
            makeContext({ ref1: 'A', ref2: 'B', diffType: 'diffBetween' }),
        );

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('A'));
        assert.ok(prompt.includes('B'));
        assert.ok(prompt.includes('diffBetween'));
    });

    test('git_log without limit', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_log.promptGenerator(makeContext({}));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('git_log with limit', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_log.promptGenerator(makeContext({ log_limit: 5 }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('5'));
    });

    test('git_blame formats file', () => {
        // === Arrange & Act ===
        const prompt = gitActions.git_blame.promptGenerator(makeContext({ filePath: 'src/x.ts' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/x.ts'));
    });

    test('tag_head formats name and upstream', () => {
        // === Arrange & Act ===
        const prompt = gitActions.tag_head.promptGenerator(makeContext({ name: 'v1.0.0', upstream: 'origin' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('v1.0.0'));
        assert.ok(prompt.includes('origin'));
    });

    test('delete_tag formats name', () => {
        // === Arrange & Act ===
        const prompt = gitActions.delete_tag.promptGenerator(makeContext({ name: 'v1.0.0' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('v1.0.0'));
    });

    test('set_git_config formats key/value', () => {
        // === Arrange & Act ===
        const prompt = gitActions.set_git_config.promptGenerator(makeContext({ key: 'user.name', value: 'Alice' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('user.name'));
        assert.ok(prompt.includes('Alice'));
    });

    test('get_git_config without key', () => {
        // === Arrange & Act ===
        const prompt = gitActions.get_git_config.promptGenerator(makeContext({}));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('get_git_config with key', () => {
        // === Arrange & Act ===
        const prompt = gitActions.get_git_config.promptGenerator(makeContext({ key: 'core.editor' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('core.editor'));
    });

    test('fetch_git_commits remote+branch', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator(
            makeContext({ remoteName: 'origin', branchName: 'main' }),
        );

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('main'));
    });

    test('fetch_git_commits remote only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator(makeContext({ remoteName: 'origin' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
    });

    test('fetch_git_commits branch only', () => {
        // === Arrange & Act ===
        const prompt = gitActions.fetch_git_commits.promptGenerator(makeContext({ branchName: 'dev' }));

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
        const prompt = gitActions.push_git_commits.promptGenerator(
            makeContext({ remoteName: 'origin', branchName: 'main', forcePush: false }),
        );

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('main'));
    });

    test('push_git_commits remote only forced', () => {
        // === Arrange & Act ===
        const prompt = gitActions.push_git_commits.promptGenerator(
            makeContext({ remoteName: 'origin', forcePush: true }),
        );

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('force'));
        assert.ok(prompt.includes('origin'));
    });

    test('push_git_commits no remote/branch forced', () => {
        // === Arrange & Act ===
        const prompt = gitActions.push_git_commits.promptGenerator(makeContext({ forcePush: true }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('force'));
    });

    test('add_git_remote formats remote and URL', () => {
        // === Arrange & Act ===
        const prompt = gitActions.add_git_remote.promptGenerator(
            makeContext({ remoteName: 'origin', remoteURL: 'git@x:y.git' }),
        );

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
        assert.ok(prompt.includes('git@x:y.git'));
    });

    test('remove_git_remote formats remote', () => {
        // === Arrange & Act ===
        const prompt = gitActions.remove_git_remote.promptGenerator(makeContext({ remoteName: 'origin' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('origin'));
    });

    test('rename_git_remote formats old/new names', () => {
        // === Arrange & Act ===
        const prompt = gitActions.rename_git_remote.promptGenerator(
            makeContext({ oldRemoteName: 'origin', newRemoteName: 'upstream' }),
        );

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

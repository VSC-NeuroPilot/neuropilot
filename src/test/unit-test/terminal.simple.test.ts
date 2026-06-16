import * as assert from 'assert';
import { terminalActions } from '@/pseudoterminal';
import { fakeContext } from '@test/test_utils';

// Tests for terminal-related prompt generators using real logic with loose checks
suite('terminal Actions', () => {
    test('execute_in_terminal prompt formats command and shell', () => {
        assert.ok(terminalActions.execute_in_terminal.promptGenerator && typeof terminalActions.execute_in_terminal.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = terminalActions.execute_in_terminal.promptGenerator(fakeContext('execute_in_terminal', { command: 'echo hi', shell: 'bash' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('echo hi'));
        assert.ok(prompt.toLowerCase().includes('bash'));
    });

    test('kill_terminal_process prompt formats shell', () => {
        assert.ok(terminalActions.kill_terminal_process.promptGenerator && typeof terminalActions.kill_terminal_process.promptGenerator !== 'string');
        // === Arrange & Act ===
        const prompt = terminalActions.kill_terminal_process.promptGenerator(fakeContext('kill_terminal_process', { shell: 'pwsh' }));

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('pwsh'));
    });

    test('get_currently_running_shells uses fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = terminalActions.get_currently_running_shells.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});



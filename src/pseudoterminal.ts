/** 
 * This file's exports are not designed/intended to be used in the WebWorker build of the extension
 * This means that the web version of the extension will not have this file here (such as [VS Code for the Web](https://vscode.dev) and its [GitHub version](https://github.dev))
 * Feel free to use Node.js APIs here - they won't be a problem.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { NEURO } from '@/constants';
import { checkWorkspaceTrust, checkVirtualWorkspace, logOutput, delayAsync, getFence } from '@/utils/misc';
import { actionValidationAccept, actionValidationFailure, ActionValidationResult, RCEAction, RCEHandlerReturns, actionHandlerFailure, actionHandlerSuccess, ActionHandlerResult } from '@/utils/neuro_client';
import { CONFIG } from '@/config';
import { notifyOnTerminalClose } from '@events/shells';
import { addActions } from '@/rce';
import { RCEContext } from '@ctx/rce';

export const CATEGORY_TERMINAL = 'Terminal Access';

/*
 * Extended interface for terminal sessions.
 * We now explicitly store the event emitter along with the pseudoterminal.
 */
export interface TerminalSession {
    terminal: vscode.Terminal;
    pty: vscode.Pseudoterminal;
    emitter: vscode.EventEmitter<string>;
    outputStdout?: string;
    outputStderr?: string;
    processStarted: boolean;
    shellProcess?: ChildProcessWithoutNullStreams;
    shellType: string;
}

function checkLiveTerminals(context: RCEContext): ActionValidationResult {
    const shellType: string = context.data.params.shell;
    const session = NEURO.terminalRegistry.get(shellType);
    if (!session)
        return actionValidationFailure(`No terminal session found for shell type "${shellType}".`);
    return actionValidationAccept();
}

export const terminalActions = {
    execute_in_terminal: {
        name: 'execute_in_terminal',
        description: 'Run a command directly in the terminal',
        category: CATEGORY_TERMINAL,
        schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The command to run in the terminal.', examples: ['echo Hello world!', 'node dist/index.js'] },
                shell: { type: 'string', enum: getAvailableShellProfileNames(), description: 'The shell to run the command in.' },
            },
            required: ['command', 'shell'],
            additionalProperties: false,
        },
        handler: handleRunCommand,
        // TODO: Auto-switch to targeted terminal (if already started) as preview effect
        cancelEvents: [
            (context: RCEContext) => notifyOnTerminalClose(context.data.params?.shell),
        ],
        validators: {
            sync: [checkVirtualWorkspace, checkWorkspaceTrust],
        },
        promptGenerator: (context: RCEContext) => `run "${context.data.params?.command}" in the "${context.data.params?.shell}" shell.`,
        registerCondition: () => checkVirtualWorkspace().success && checkWorkspaceTrust().success,
    },
    kill_terminal_process: {
        name: 'kill_terminal_process',
        description: 'Kill a terminal process that is running.',
        category: CATEGORY_TERMINAL,
        schema: {
            type: 'object',
            properties: {
                shell: { type: 'string', description: 'The shell to kill.', enum: getAvailableShellProfileNames() },
            },
            required: ['shell'],
            additionalProperties: false,
        },
        handler: handleKillTerminal,
        // TODO: Auto-switch to targeted terminal as preview effect
        cancelEvents: [
            (context: RCEContext) => notifyOnTerminalClose(context.data.params?.shell),
        ],
        validators: {
            sync: [checkLiveTerminals, checkVirtualWorkspace, checkWorkspaceTrust],
        },
        promptGenerator: (context: RCEContext) => `kill the "${context.data.params?.shell}" shell.`,
        registerCondition: () => checkVirtualWorkspace().success && checkWorkspaceTrust().success,
    },
    get_currently_running_shells: {
        name: 'get_currently_running_shells',
        description: 'Get the list of terminal processes that are spawned.',
        category: CATEGORY_TERMINAL,
        handler: handleGetCurrentlyRunningShells,
        validators: {
            sync: [checkVirtualWorkspace, checkWorkspaceTrust],
        },
        promptGenerator: 'get the list of currently running shells.',
        registerCondition: () => checkVirtualWorkspace().success && checkWorkspaceTrust().success,
    },
} satisfies Record<string, RCEAction>;

export function addTerminalActions() {
    addActions([
        terminalActions.execute_in_terminal,
        terminalActions.kill_terminal_process,
        terminalActions.get_currently_running_shells,
    ]);
}

/**
* Fetches the list of terminal configurations from the `neuropilot.terminals` setting.
*/
function getCustomTerminalConfigs(): { name: string; path: string; args?: string[] }[] {
    const config = vscode.workspace.getConfiguration('neuropilot');
    const terminals = config.get<{ name: string; path: string; args?: string[] }[]>('terminals', []);
    return terminals;
}

/**
* Returns the names of all available terminal profiles from the custom configuration.
*/
export function getAvailableShellProfileNames(): string[] {
    const terminalConfigs = getCustomTerminalConfigs();
    return terminalConfigs.map((terminal) => terminal.name);
}

/**
* Look up the shell executable and arguments for a given profile name.
* Falls back to the first terminal in the list if the profile name is not found.
*/
function getShellProfileForType(shellType: string): { shellPath: string; shellArgs?: string[] } {
    const terminalConfigs = getCustomTerminalConfigs();
    const terminal = terminalConfigs.find((t) => t.name === shellType);

    if (terminal) {
        return { shellPath: terminal.path, shellArgs: terminal.args || [] };
    }

    // Fallback to the first terminal in the list if no match is found
    if (terminalConfigs.length > 0) {
        return { shellPath: terminalConfigs[0].path, shellArgs: terminalConfigs[0].args || [] };
    }

    throw new Error(`No terminal configuration found for shell type: ${shellType}`);
}

/**
* Creates a new pseudoterminal-based session.
* This version captures output in separate STDOUT and STDERR properties.
*/
function createPseudoterminal(shellType: string, terminalName: string): TerminalSession {
    const emitter = new vscode.EventEmitter<string>();

    const startTime: string = new Date().toLocaleString();
    const startTimePermission: boolean = CONFIG.showTimeOnTerminalStart;

    // Define the pseudoterminal.
    const pty: vscode.Pseudoterminal = {
        onDidWrite: emitter.event,
        open: () => {
            // Write an initial message when the terminal opens.
            emitter.fire(`Terminal "${terminalName}" ready${startTimePermission ? ` at ${startTime}` : ''}.\r\n`);
        },
        close: () => {
            // On terminal close, kill the spawned process if it exists.
            if (session.shellProcess) {
                session.shellProcess.kill();
            }
        },
    };

    // 50/50 chance of icon selection no longer
    const icon = vscode.Uri.joinPath(NEURO.context!.extensionUri, 'assets/console.png');

    // Create the terminal using VS Code's API.
    const terminal = vscode.window.createTerminal({
        name: terminalName,
        pty: pty,
        iconPath: icon,
        isTransient: false,
    });

    // Create the session object.
    const session: TerminalSession = {
        terminal,
        pty,
        emitter,
        outputStdout: '',
        outputStderr: '',
        processStarted: false,
        shellProcess: undefined,
        shellType,
    };

    return session;
}

/**
* Returns an existing session for the given shell type or creates a new one.
* Uses the global NEURO.terminalRegistry.
*/
function getOrCreateTerminal(shellType: string, terminalName: string): TerminalSession {
    let session = NEURO.terminalRegistry.get(shellType);
    if (!session || session.shellProcess === undefined || session.shellProcess.killed) {
        session = createPseudoterminal(shellType, terminalName);
        NEURO.terminalRegistry.set(shellType, session);
        session.terminal.show();
    } else {
        session.terminal.show();
    }
    return session;
}

/**
* Run command handler.
* Checks permissions, executes the command in the requested shell,
* captures STDOUT and STDERR, logs the output, and sends it to nwero.
*/
export function handleRunCommand(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;

    // Get the command and shell.
    const command: string = actionData.params?.command;
    const shellType: string = actionData.params?.shell;

    // Get or create the terminal session for this shell.
    const session = getOrCreateTerminal(shellType, `${NEURO.currentController}: ${shellType}`);
    const outputDelay = CONFIG.terminalContextDelay;

    // Reset previous outputs.
    session.outputStdout = '';
    session.outputStderr = '';

    async function sendStdoutIfUnchangedAsync(delay: number) {
        const cachedOutput = session.outputStdout;
        await delayAsync(delay);
        if (session.outputStdout === cachedOutput) {
            const fence = getFence(session.outputStdout!);
            NEURO.client?.sendContext(
                `The ${shellType} terminal outputted the following to stdout:\n\n${fence}\n${session.outputStdout!.replace(/\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7F]|\x1b\]0;.+\r?\n/g, '')}\n${fence}`,
                false,
            );
            session.outputStdout = '';
        }
    }

    async function sendStderrIfUnchangedAsync(delay: number) {
        const cachedOutput = session.outputStderr;
        await delayAsync(delay);
        if (session.outputStderr === cachedOutput) {
            const fence = getFence(session.outputStderr!);
            NEURO.client?.sendContext(
                `The ${shellType} terminal outputted the following to stderr:\n\n${fence}\n${session.outputStderr!.replace(/\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7F]|\x1b\]0;.+\r?\n/g, '')}\n${fence}`,
                false,
            );
            session.outputStderr = '';
        }
    }

    function returnSuccess() {
        return actionHandlerSuccess(`Wrote to ${shellType}`, 'Wrote command to shell stdin');
    }

    // If no process has been started, spawn it.
    if (!session.processStarted) {
        session.processStarted = true;
        const { shellPath, shellArgs } = getShellProfileForType(shellType);

        logOutput('DEBUG', `Shell: ${shellPath} ${shellArgs}`);

        if (!shellPath || typeof shellPath !== 'string')
            return actionHandlerFailure(`Couldn't determine executable for shell profile ${shellType}`, 'Couldn\'t determine executable for provided shell');

        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        session.shellProcess = spawn(shellPath, shellArgs || [], { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
        const proc = session.shellProcess;

        proc.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            session.outputStdout += text;
            session.emitter.fire(text.replace(/(?<!\r)\n/g, '\r\n'));
            sendStdoutIfUnchangedAsync(outputDelay);
            logOutput('DEBUG', `STDOUT: ${text}`);
        });

        proc.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            session.outputStderr += text;
            session.emitter.fire(text.replace(/(?<!\r)\n/g, '\r\n'));
            sendStderrIfUnchangedAsync(outputDelay);
            logOutput('ERROR', `STDERR: ${text}`);
        });

        proc.on('exit', (code) => {
            NEURO.client?.sendContext(code === null ? `The ${shellType} terminal closed with a null exit code. Someone did something to it.` : `Terminal ${shellType} exited with code ${code}.`);
            logOutput('INFO', `${shellType} process exited with code ${code}`);
        });

        proc.stdin.write(command + '\n');
        logOutput('DEBUG', `Sent command: ${command}`);
        return returnSuccess();
    } else {
        // Process is already running; send the new command via stdin.
        const shellProcess = session.shellProcess;
        if (shellProcess && shellProcess.stdin.writable) {
            shellProcess.stdin.write(command + '\n');
            logOutput('DEBUG', `Sent command: ${command}`);
            return returnSuccess();
        } else {
            return actionHandlerFailure('Unable to write to shell process.', `Couldn't write to ${shellType} stdin`);
        }
    }
}

/**
 * Kill terminal handler.
 * Checks if the terminal registry contains the open shell and forcefully kills the shell if found.
 */
export function handleKillTerminal(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    // Validate shell type parameter.
    const shellType: string = actionData.params?.shell;
    const session = NEURO.terminalRegistry.get(shellType)!;

    // Dispose of the terminal and remove it from the registry.
    session.terminal.dispose();
    NEURO.terminalRegistry.delete(shellType);

    // Notify Neuro and the user.
    return actionHandlerSuccess(`Terminal session for shell type "${shellType}" has been terminated.`, `Successfully killed ${shellType}`);
}

/**
 * Returns a list of currently running shell types.
 * Each entry includes the shell type and its status.
 */
export function handleGetCurrentlyRunningShells(): ActionHandlerResult {
    const runningShells: string[] = [];

    for (const [shellType, session] of NEURO.terminalRegistry.entries()) {
        const status = session.shellProcess && !session.shellProcess.killed ? 'Running' : 'Stopped';
        runningShells.push(`Name: ${shellType}\nStatus: ${status}\n`);
    }

    if (runningShells.length === 0) {
        return actionHandlerFailure('No running shells found.', 'No shells open');
    }
    else {
        return actionHandlerSuccess(`Currently running shells:\n${runningShells.join('\n')}`, `${runningShells.length} Neuro shells running`);
    };
}

/**
 * Forcefully kills all active terminals in the NEURO.terminalRegistry.
 * This function is intended for emergency use and will terminate all terminals regardless of their state.
 * Use with caution. Killing multiple active shells can corrupt your files.
 */
export function emergencyTerminalShutdown() {
    // Check if there are any active terminals in the registry.
    if (NEURO.terminalRegistry.size === 0) {
        logOutput('INFO', 'No active terminals to shut down.');
        return;
    }

    logOutput('INFO', 'Initiating emergency shutdown of all terminals...');

    let failedShutdownCount = 0;
    const failedShutdownTerminals: string[] = [];

    // Iterate through all terminal sessions in the registry.
    for (const [shellType, session] of NEURO.terminalRegistry.entries()) {
        try {
            // Dispose of the terminal.
            session.terminal.dispose();
            logOutput('INFO', `Terminal session for shell type "${shellType}" has been terminated.`);
        } catch (erm) {
            logOutput('ERROR', `Failed to terminate terminal session for shell type "${shellType}": ${erm}`);
            failedShutdownTerminals.push(shellType);
            failedShutdownCount += 1;
        }
    }

    // Clear the terminal registry.
    NEURO.terminalRegistry.clear();

    // Notify Neuro and log the shutdown.
    NEURO.client?.sendContext('Emergency shutdown: All terminal sessions have been forcefully terminated.');
    if (failedShutdownCount == 0) {
        logOutput('INFO', 'Emergency shutdown complete. All terminals have been terminated.');
    } else {
        logOutput('WARNING', `Failed to terminate ${failedShutdownCount} shells, including: ${failedShutdownTerminals}.`);
        vscode.window.showWarningMessage(`Failed to terminate ${failedShutdownCount} terminal(s), which include these terminals: ${failedShutdownTerminals.join(', ')}.\nPlease check on them.`);
    }
}

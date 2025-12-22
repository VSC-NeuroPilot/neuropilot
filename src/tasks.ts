/** 
 * This file's exports are not designed/intended to be used in the WebWorker build of the extension
 * This means that the web version of the extension will not have this file here (such as [VS Code for the Web](https://vscode.dev) and its [GitHub version](https://github.dev))
 * Feel free to use Node.js APIs here - they won't be a problem.
 */

import * as vscode from 'vscode';

import { NEURO } from '@/constants';
import { logOutput, formatActionID, getFence, checkWorkspaceTrust, checkVirtualWorkspace } from '@/utils';
import { ActionData, RCEAction, actionValidationAccept, actionValidationFailure } from './utils/neuro_client';
import { ACTIONS } from './config/getters';
import { notifyOnTaskFinish } from '@events/shells';
import { addActions, getActions, removeActions } from './rce';

const CATEGORY_TASKS = 'Tasks';
const CATEGORY_REGISTERED_TASKS = 'Registered Tasks';

export const taskHandlers = {
    // handleRunTask is used separately and not on this list
    terminate_task: {
        name: 'terminate_task',
        description: 'Terminate the currently running task',
        category: CATEGORY_TASKS,
        handler: handleTerminateTask,
        cancelEvents: [
            notifyOnTaskFinish,
        ],
        promptGenerator: 'terminate the currently running task.',
        validators: {
            sync: [checkVirtualWorkspace, checkWorkspaceTrust, () => NEURO.currentTaskExecution !== null
                ? actionValidationAccept()
                : actionValidationFailure('No task to terminate.'),
            ],
        },
        registerCondition: () => checkVirtualWorkspace().success && checkWorkspaceTrust().success,
    },
} satisfies Record<string, RCEAction>;

export function addTaskActions() {
    // TODO: Maybe only register once a task is running?
    addActions([
        taskHandlers.terminate_task,
    ]);
    // Tasks are registered asynchronously in reloadTasks()
}

export function handleTerminateTask(_actionData: ActionData): string | undefined {
    const exe = NEURO.currentTaskExecution!;
    NEURO.currentTaskExecution = null;
    exe.terminate();
    logOutput('INFO', 'Terminated current task');
    return 'Terminated current task.';
}

export function handleRunTask(actionData: ActionData): string | undefined {
    if (NEURO.currentTaskExecution !== null)
        return 'Action failed: A task is already running.';

    const task = NEURO.tasks.find(task => task.id === actionData.name);
    if (task === undefined)
        return `Action failed: Task ${actionData.name} not found.`;

    try {
        vscode.tasks.executeTask(task.task).then(value => {
            logOutput('INFO', `Executing task ${task.id}`);
            NEURO.currentTaskExecution = value;
        });
        return `Executing task ${task.id}`;
    } catch (erm) {
        logOutput('DEBUG', JSON.stringify(erm));
        return `Failed to execute task ${task.id}.`;
    }
}

export function taskEndedHandler(event: vscode.TaskEndEvent) {
    if (NEURO.connected && NEURO.client !== null && NEURO.currentTaskExecution !== null) {
        if (event.execution === NEURO.currentTaskExecution) {
            logOutput('INFO', 'Neuro task finished');
            NEURO.currentTaskExecution = null;
            vscode.commands.executeCommand('workbench.action.terminal.copyLastCommandOutput')
                .then(
                    _ => vscode.env.clipboard.readText(),
                ).then(
                    text => {
                        const fence = getFence(text);
                        NEURO.client?.sendContext(`Task finished! Output:\n\n${fence}\n${text}\n${fence}`);
                    },
                );
        }
    }
}

export function reloadTasks() {
    NEURO.tasks = [];
    const tasks = getActions()
        .filter(action => action.category === CATEGORY_REGISTERED_TASKS)
        .map(action => action.name);
    removeActions(tasks);

    vscode.tasks.fetchTasks().then((tasks) => {
        for (const task of tasks) {
            if (ACTIONS.allowRunningAllTasks === true && vscode.workspace.isTrusted) {
                let taskdesc: string = task.detail ?? '';
                if (taskdesc.toLowerCase().startsWith('[neuro]')) {
                    taskdesc = taskdesc.substring(7).trim();
                }
                logOutput('INFO', `Adding task: ${task.name}`);
                NEURO.tasks.push({
                    id: formatActionID(task.name),
                    description: (task.detail?.length ?? 0) > 0 ? taskdesc : task.name,
                    task,
                });
            } else if (task.detail?.toLowerCase().startsWith('[neuro]')) {
                // Only allow tasks whose details start with '[Neuro]'
                const detail = task.detail?.substring(7).trim();
                logOutput('INFO', `Adding Neuro task: ${task.name}`);
                NEURO.tasks.push({
                    id: formatActionID(task.name),
                    description: detail.length > 0 ? detail : task.name,
                    task,
                });
            }
            else {
                logOutput('INFO', `Ignoring task: ${task.name}`);
            }
        }
        addActions(NEURO.tasks.map((task) => ({
            name: task.id,
            description: task.description,
            category: CATEGORY_REGISTERED_TASKS,
            handler: handleRunTask,
            promptGenerator: `run the task: ${task.description}`,
            validators: {
                sync: [checkVirtualWorkspace, checkWorkspaceTrust],
            },
            registerCondition: () => checkVirtualWorkspace().success && checkWorkspaceTrust().success,
        })));
    });
}

import { NEURO } from '@/constants';
import { addFileActions } from '@/file_actions';
import { addEditingActions } from '@/editing';
import { ActionData } from '../utils/neuro_client';
import { addLintActions } from '@/lint_problems';
import { RCEActionHandler } from '@/rce';
import { addChangelogActions } from '@/changelog';
import { addRequestCookieAction } from '@/context';

export function addUnsupervisedActions() {
    addFileActions();
    addEditingActions();
    addLintActions();
    addChangelogActions();
    addRequestCookieAction();
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData));
}

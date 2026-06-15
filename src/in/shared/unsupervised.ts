import { NEURO } from '@/constants';
import { addFileActions } from '@/file_operations';
import { addEditingActions } from '@/edit_files';
import { addLintActions } from '@/lint_problems';
import { addActions, cancelRequestAction, RCEActionHandler } from '@/rce';
import { addChangelogActions } from '@/changelog';
import { addRequestCookieAction } from '@/functions/cookies';
import { addReadActions } from '@/read_files';

export function addCommonUnsupervisedActions() {
    addFileActions();
    addEditingActions();
    addReadActions();
    addLintActions();
    addChangelogActions();
    addRequestCookieAction();
    addActions([cancelRequestAction]);
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction(RCEActionHandler);
}

import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { logOutput, simpleFileName, getPositionContext, formatContext, NeuroPositionContext } from '@/utils/misc';
import { CONFIG, CONNECTION, PermissionLevel } from '@/config';
import { JSONSchema7 } from 'json-schema';
import { actionHandlerFailure, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, actionValidationRetry, RCEAction, RCEHandlerReturns } from '@/utils/neuro_client';
import { RCEContext } from '@ctx/rce';
import { abortActionForce, addActions, canForceActions, tryForceActions } from '@/rce';
import { ActionForcePriorityEnum } from 'neuro-game-sdk';

let lastSuggestions: string[] = [];
let requestCancelled = false;

// TODO: Figure out how to do this with maxCount
// export const completionAction = (maxCount: number) => ({
export const completeCodeAction: RCEAction = {
    name: 'complete_code',
    description: 'Suggest code to write.' +
        ' Only one suggestion you provide will be chosen.' +
        ' Your suggestions can be single lines or multi-line code snippets.',
    schema: {
        type: 'object',
        properties: {
            suggestions: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 3,
            },
        },
        required: ['suggestions'],
        additionalProperties: false,
    } satisfies JSONSchema7,
    category: 'Completions',
    handler: handleCompleteCode,
    validators: {
        sync: [
            () => NEURO.currentActionForce // This is done before the action force is cleared
                ? actionValidationAccept()
                : actionValidationFailure('Not currently waiting for code suggestions'),
            () => requestCancelled
                ? actionValidationFailure('Request was cancelled')
                : actionValidationAccept(),
            (context) => {
                const maxCount = CONFIG.maxCompletions || 3;
                if (context.data.params!.suggestions.length > maxCount)
                    return actionValidationRetry(`Too many suggestions. Maximum is ${maxCount}.`);
                return actionValidationAccept();
            },
        ],
    },
    promptGenerator: null, // Only ever run in Autopilot mode
    defaultPermission: PermissionLevel.OFF, // Used with overridePermissions in forceActions
    hidden: true,
} as const;

function handleCompleteCode(context: RCEContext): RCEHandlerReturns {
    if (requestCancelled)
        return actionHandlerFailure('Request was cancelled');
    if (!NEURO.currentActionForce)
        return actionHandlerFailure('Not currently waiting for suggestions');

    lastSuggestions = context.data.params.suggestions;
    logOutput('INFO', 'Received suggestions:\n' + JSON.stringify(lastSuggestions));
    return actionHandlerSuccess();
}

export function addCompleteCodeAction() {
    addActions([completeCodeAction], false);
}

// TODO: Figure out maxCount properly
export function requestCompletion(cursorContext: NeuroPositionContext, fileName: string, language: string, maxCount: number) {
    // If completions are disabled, notify and return early.
    if (CONFIG.completionTrigger === 'off') {
        if (!NEURO.warnOnCompletionsOff) {
            return;
        }
        vscode.window.showInformationMessage('Inline completions with NeuroPilot are disabled.', 'Don\'t show again this session')
            .then(selection => {
                if (selection === 'Don\'t show again this session') {
                    NEURO.warnOnCompletionsOff = false;
                }
            });
        return;
    }

    // Obviously we need Neuro to be connected
    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to request completion while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    // You can't request a completion while already waiting
    if (!canForceActions()) {
        logOutput('WARNING', 'Already forcing an action from Neuro, aborting force attempt.');
        return;
    }

    logOutput('INFO', `Requesting completion for ${fileName}`);

    const status = tryForceActions({
        query: 'Suggest code to be inserted at the cursor position based on the provided context.'
            + (maxCount === 1
                ? ' Your suggestion can be a single line or a multi-line code snippet.'
                + '**IMPORTANT**: Provide only one suggestion.'

                : ' Your suggestions can be single lines or multi-line code snippets.'
                + ' If you decide to provide multiple suggestions, put the suggestion you\'re most confident in first.'
                + ' Only one of your suggestions will be used.'
                + `**IMPORTANT**: Do not provide more than ${maxCount} suggestions.`
            ),
        actionNames: [completeCodeAction.name],
        state: formatContext(cursorContext),
        ephemeral_context: false,
        priority: ActionForcePriorityEnum.HIGH, // Process immediately, shorten utterance (Completions should be fast, but are not critical)
        overridePermissions: PermissionLevel.AUTOPILOT,
    });
    if (!status) {
        logOutput('ERROR', 'Failed to force completion action');
        vscode.window.showErrorMessage('Failed to request completion from Neuro.');
        return;
    }
    requestCancelled = false;
}

export function cancelCompletionRequest() {
    requestCancelled = true;
    abortActionForce();
    NEURO.client?.sendContext(`${CONNECTION.userName} cancelled the completion request.`);
}

export const completionsProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
        const result: vscode.InlineCompletionList = {
            items: [],
        };

        const triggerAuto = CONFIG.completionTrigger === 'automatic';
        if (!triggerAuto && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            return result;
        }

        // Get context
        const cursorContext = getPositionContext(document, position);
        const fileName = simpleFileName(document.fileName);
        const maxCount = CONFIG.maxCompletions || 3;

        requestCompletion(cursorContext, fileName, document.languageId, maxCount);

        token.onCancellationRequested(() => {
            logOutput('INFO', 'Cancelled request');
            cancelCompletionRequest();
        });

        const timeoutMs = CONFIG.timeout ?? 10000;
        const timeout = new Promise<void>((_, reject) => setTimeout(() => reject('Request timed out'), timeoutMs));
        const completion = new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (!NEURO.currentActionForce) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });

        try {
            await Promise.race([timeout, completion]);
        } catch (erm) {
            if (typeof erm === 'string') {
                logOutput('ERROR', erm);
                requestCancelled = true;
                vscode.window.showErrorMessage(erm);
            }
            else {
                throw erm;
            }
        }

        for (const suggestion of lastSuggestions) {
            result.items.push({
                insertText: suggestion.trim(),
            });
        }

        return result;
    },
};

import * as vscode from 'vscode';
import assert from 'node:assert';
import { defineAction, PermissionLevel } from '@vsc-neuropilot/api-types';
import { z } from 'zod';

import { NEURO } from '@/constants';
import { logOutput } from '@/utils/misc';
import { CONFIG, CONNECTION } from '@/config';
import { actionHandlerFailure, actionHandlerSuccess, actionValidationAccept, actionValidationFailure } from './utils/neuro_client';
import { abortActionForce, addActions, registerAction, tryForceActions } from '@/rce';
import { contextFileContent, contextPath } from '@vsc-neuropilot/api-types/utils';

let requestCancelled = false;

interface Participant {
    id: string;
    relativeIconPath: string;
}

const NEURO_PARTICIPANTS: Participant[] = [
    {
        id: 'neuropilot.neuro',
        relativeIconPath: 'assets/neuropilot.png',
    },
    {
        id: 'neuropilot.evil',
        relativeIconPath: 'assets/evilpilot.png',
    },
    {
        id: 'neuropilot.api',
        relativeIconPath: 'assets/heart.png',
    },
];

interface NeuroChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

interface NeuroChatContext {
    fileName?: string;
    range?: vscode.Range;
    text: string;
}

let lastChatResponse = '';

export function addChatAction() {
    addActions([chatAction], false);
}

export const chatAction = defineAction({
    name: 'chat',
    description:
        `Provide an answer to ${CONNECTION.userName}'s request.` +
        ' Use markdown to format your response.' +
        ' You may additionally include code blocks by using triple backticks.' +
        ' Be sure to use the correct language identifier after the first set of backticks.' +
        ' If you decide to include a code block, make sure to explain what it is doing.',
    schema: z.object({
        answer: z.string(),
    }),
    handler(ctx) {
        const answer = ctx.data.params.answer;

        if (requestCancelled) {
            return actionHandlerFailure('Request was cancelled');
        }

        lastChatResponse = answer;
        logOutput('INFO', 'Received chat response:\n' + answer);
        return actionHandlerSuccess();
    },
    validators: {
        sync: [
            () => NEURO.currentActionForce // This is done before the action force is cleared
                ? actionValidationAccept()
                : actionValidationFailure('Not currently waiting for a chat response'),
            () => requestCancelled
                ? actionValidationFailure('Request was cancelled')
                : actionValidationAccept(),
        ],
    },
    promptGenerator: null, // Only ever run in Autopilot mode
    category: 'Chat',
    hidden: true,
    defaultPermission: PermissionLevel.OFF, // Used with overridePermissions in forceActions
});

export function registerChatParticipant() {
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<NeuroChatResult> => {
        let prefix = '';
        const currentAPI = CONNECTION.nameOfAPI;

        if (request.command === 'fix') {
            prefix = `${CONNECTION.userName} wants you to fix the following error(s):\n`;
        } else if (request.command === 'explain') {
            prefix = `${CONNECTION.userName} wants you to explain the following:\n`;
        }

        if (!NEURO.connected) {
            stream.markdown('Not connected to Neuro API.');
            stream.button({
                command: 'neuropilot.reconnect',
                title: 'Reconnect',
                tooltip: 'Attempt to reconnect to Neuro API',
            });
            return { metadata: { command: '' } };
        }
        if (NEURO.currentActionForce) {
            stream.markdown(`Already waiting for a response from ${currentAPI}.`);
            // stream.button({
            //     command: 'neuropilot.reconnect',
            //     title: 'Reconnect',
            //     tooltip: 'Attempt to reconnect to Neuro API',
            // });

            return { metadata: { command: '' } };
        }

        // Collect references
        stream.progress('Collecting references...');

        const references: NeuroChatContext[] = [];
        for (const ref of request.references) {
            if (ref.value instanceof vscode.Location) {
                const document = await vscode.workspace.openTextDocument(ref.value.uri);
                assert(ref.value instanceof vscode.Location);
                const text = contextFileContent(document.getText(ref.value.range));
                references.push({
                    fileName: contextPath(ref.value.uri.fsPath),
                    range: ref.value.range,
                    text: text,
                });
            } else if (ref.value instanceof vscode.Uri) {
                const document = await vscode.workspace.openTextDocument(ref.value);
                assert(ref.value instanceof vscode.Uri);
                const text = contextFileContent(document.getText());
                references.push({
                    fileName: contextPath(ref.value.fsPath),
                    text,
                });
            } else if (typeof ref.value === 'string') {
                references.push({
                    text: contextFileContent(ref.value),
                });
            } else {
                logOutput('ERROR', 'Invalid reference type');
            }
        }

        // Query Neuro API
        stream.progress(`Waiting for ${currentAPI} to respond...`);

        const answer = await requestChatResponse(
            prefix + request.prompt,
            JSON.stringify({ references: references }),
            token,
        );

        stream.markdown(answer);

        return { metadata: { command: '' } };
    };

    for (const participant of NEURO_PARTICIPANTS) {
        const chatter = vscode.chat.createChatParticipant(participant.id, handler);
        chatter.iconPath = vscode.Uri.joinPath(NEURO.context!.extensionUri, participant.relativeIconPath);

        NEURO.context!.subscriptions.push(
            chatter.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
                if (feedback.kind === vscode.ChatResultFeedbackKind.Helpful) {
                    logOutput('INFO', 'Answer was deemed helpful');
                    NEURO.client?.sendContext(`${CONNECTION.userName} found your answer helpful.`);
                } else {
                    logOutput('INFO', 'Answer was deemed unhelpful');
                    logOutput('DEBUG', JSON.stringify(feedback));
                    NEURO.client?.sendContext(`${CONNECTION.userName} found your answer unhelpful.`);
                }
            }),
        );
    }
}

async function requestChatResponse(
    prompt: string,
    state: string,
    token: vscode.CancellationToken,
): Promise<string> {
    logOutput('INFO', 'Requesting chat response from Neuro');

    requestCancelled = false;

    registerAction(chatAction.name);
    const status = tryForceActions({
        query: prompt,
        state,
        actionNames: [chatAction.name],
        ephemeral_context: false,
        overridePermissions: PermissionLevel.AUTOPILOT,
    });
    if (!status) {
        logOutput('ERROR', 'Failed to force chat action');
        return 'Failed to request response from Neuro.';
    }

    token.onCancellationRequested(() => {
        logOutput('INFO', 'Cancelled request');
        cancelChatRequest();
    });

    const timeoutMs = CONFIG.timeout || 10000;
    const timeout = new Promise<string>((_, reject) => setTimeout(() => reject('Request timed out'), timeoutMs));
    const response = new Promise<string>((resolve) => {
        const interval = setInterval(() => {
            if (!NEURO.currentActionForce) {
                clearInterval(interval);
                resolve(lastChatResponse);
            }
        }, 100);
    });

    try {
        return await Promise.race([timeout, response]);
    } catch (erm) {
        if (typeof erm === 'string') {
            logOutput('ERROR', erm);
            requestCancelled = true;
            return erm;
        } else {
            throw erm;
        }
    }
}

export function cancelChatRequest() {
    requestCancelled = true;
    if (!NEURO.client) return;
    if (NEURO.currentActionForce?.actionNames.length === 1 && NEURO.currentActionForce.actionNames[0] === chatAction.name) {
        abortActionForce();
    }
}

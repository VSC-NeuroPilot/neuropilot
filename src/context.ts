import * as vscode from 'vscode';

import { getFence, logOutput, notifyOnCaughtException, simpleFileName } from '@/utils';
import { NEURO } from '@/constants';
import { CONNECTION, PERMISSIONS, PermissionLevel, getPermissionLevel, isActionEnabled } from '@/config';

export function sendCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logOutput('ERROR', 'No active text editor');
        vscode.window.showErrorMessage('No active text editor.');
        return;
    }
    const document = editor.document;
    const fileName = simpleFileName(document.fileName);
    const language = document.languageId;
    const text = document.getText();

    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to send current file while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    logOutput('INFO', 'Sending current file to Neuro API');
    const fence = getFence(text);
    NEURO.client?.sendContext(`${CONNECTION.userName} sent you the contents of the file ${fileName}.\n\nContent:\n\n${fence}${language}\n${text}\n${fence}`);
}

export function registerRequestCookieAction() {
    NEURO.client?.unregisterActions(['request_cookie']);

    if (!getPermissionLevel(PERMISSIONS.requestCookies) || !isActionEnabled('request_cookie'))
        return;

    NEURO.client?.registerActions([
        {
            name: 'request_cookie',
            description: `Ask ${CONNECTION.userName} for a cookie. You can request a specific flavor, but it's up to ${CONNECTION.userName} to decide.`,
            schema: {
                type: 'object',
                properties: {
                    flavor: { type: 'string' },
                },
                additionalProperties: false,
            },
        },
    ]);
}

export function registerRequestCookieHandler() {
    NEURO.client?.onAction((actionData) => {
        if (actionData.name === 'request_cookie') {
            NEURO.actionHandled = true;

            try {
                if (NEURO.waitingForCookie) {
                    logOutput('INFO', 'Already waiting for a cookie');
                    NEURO.client?.sendActionResult(actionData.id, true, 'You already asked for a cookie.');
                    return;
                }

                const permission = getPermissionLevel(PERMISSIONS.requestCookies);

                switch (permission) {
                    case PermissionLevel.OFF:
                        logOutput('WARNING', 'Neuro attempted to request a cookie, but permission is disabled');
                        NEURO.client?.sendActionResult(actionData.id, true, 'Permission to request cookies is disabled.');
                        break;
                    case PermissionLevel.COPILOT:
                        NEURO.waitingForCookie = true;
                        vscode.window.showInformationMessage(
                            `${NEURO.currentController} is asking for a${actionData.params?.flavor ? ' ' + actionData.params.flavor : ''} cookie.`,
                            'Give',
                            'Deny',
                        ).then((value) => {
                            if (value === 'Give') {
                                giveCookie(true, actionData.params?.flavor);
                            } else if (value === 'Deny' || value === undefined) {
                                denyCookie();
                            }
                            NEURO.waitingForCookie = false;
                        });
                        NEURO.client?.sendActionResult(actionData.id, true, 'Vedal has been asked for a cookie.');
                        break;
                    case PermissionLevel.AUTOPILOT:
                        if (!actionData.params?.flavor) {
                            NEURO.client?.sendActionResult(actionData.id, false, 'You need to specify a flavor!');
                            break;
                        }
                        logOutput('INFO', `Neuro grabbed a ${actionData.params?.flavor} cookie.`);
                        NEURO.client?.sendActionResult(actionData.id, true, `You grabbed a ${actionData.params?.flavor} cookie!`);
                        break;
                }
            } catch (erm) {
                const actionName = actionData.name;
                notifyOnCaughtException(actionName, erm);
                NEURO.client?.sendActionResult(actionData.id, true, `An error occured while executing the action "${actionName}". You may retry if you like, but it may be better to ask Vedal to check what's up.`);
                return;
            }
        }
    });
}

export function giveCookie(isRequested = false, defaultFlavor = 'Chocolate Chip') {
    NEURO.waitingForCookie = false;
    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to give cookie while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    vscode.window.showInputBox({
        prompt: 'What flavor?',
        placeHolder: 'Chocolate Chip',
        value: defaultFlavor,
        title: `Give ${NEURO.currentController} a cookie`,
    }).then((flavor) => {
        if (!flavor) {
            logOutput('INFO', 'No flavor given, canceling cookie');
            if (isRequested)
                NEURO.client?.sendContext(`${CONNECTION.userName} couldn't decide on a flavor for your cookie.`);
            return;
        }
        logOutput('INFO', 'Giving cookie to Neuro');
        NEURO.client?.sendContext(`${CONNECTION.userName} gave you a ${flavor} cookie!`);
    });
}

export function denyCookie() {
    NEURO.waitingForCookie = false;
    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to deny cookie while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    logOutput('INFO', 'Denying cookie to Neuro');
    NEURO.client?.sendContext(`${CONNECTION.userName} denied you the cookie.`);
}

import * as vscode from 'vscode';

import { logOutput } from '@/utils/misc';
import { NEURO } from '@/constants';
import { CONNECTION, PermissionLevel, getPermissionLevel } from '@/config';
import { addActions, CATEGORY_MISC } from '@/rce';
import { actionHandlerFailure, actionHandlerSuccess, RCEAction } from '@/utils/neuro_client';
import { RCEContext, SimplifiedStatusUpdateHandler } from '@ctx/rce';

export const REQUEST_COOKIE_ACTION: RCEAction = {
    name: 'request_cookie',
    description: `Ask ${CONNECTION.userName} for a cookie. You can request a specific flavor, but it's up to ${CONNECTION.userName} to decide.`,
    category: CATEGORY_MISC,
    schema: {
        type: 'object',
        properties: {
            flavor: { type: 'string' },
        },
        additionalProperties: false,
    },
    handler: handleRequestCookie,
    promptGenerator: (context: RCEContext) => `have a${context.data.params?.flavor ? ' ' + context.data.params.flavor : ''} cookie.`,
    defaultPermission: PermissionLevel.COPILOT,
};

export function addRequestCookieAction() {
    addActions([REQUEST_COOKIE_ACTION]);
}

function handleRequestCookie(context: RCEContext) {
    const { data: actionData, updateStatus } = context;
    const permission = getPermissionLevel(actionData.name);

    switch (permission) {
        case PermissionLevel.COPILOT: {
            giveCookie(true, actionData.params.flavor, updateStatus);
            return actionHandlerSuccess(`Waiting on ${CONNECTION.userName} to decide on the flavor.`, 'Waiting for cookie flavor...');
        }
        case PermissionLevel.AUTOPILOT: {
            logOutput('INFO', `Neuro grabbed a ${actionData.params.flavor} cookie.`);
            if (actionData.params?.flavor) {
                // Return flavor as requested
                return actionHandlerSuccess(`You grabbed a ${actionData.params.flavor} cookie!`, `${actionData.params.flavor} cookie grabbed`);
            }
            // Funny quotes if no flavor specified
            const base = 'You grabbed an undefined cookie. ';
            const quotes = [
                'Wait a second...',
                `Unfortunately, ${CONNECTION.userName} wasn't around to decide the flavor for you.`,
                'Maybe you should have defined it.',
                'You could maybe write the Cookie class to define it.',
                'Probably undefined taste as well.',
                'It\'s still a cookie. Probably.',
                'Isn\'t that just stale cookies?',
                'You should probably #define it.',
                'NullReferenceException: Flavor reference not set to an instance of a Cookie.',
                'TypeError: Cannot read property \'flavor\' of undefined cookie.',
                'Segmentation fault (core dumped).',
            ];
            const randomIndex = Math.floor(Math.random() * quotes.length);
            return actionHandlerFailure(base + quotes[randomIndex], `${base.replace('You', CONNECTION.nameOfAPI)}${quotes[randomIndex].replace(/you|You/g, CONNECTION.nameOfAPI)} (undefined flavor)`);
        }
        default:
            return actionHandlerFailure('Uhhhh, something went wrong', 'Somehow, this action\'s permission wasn\'t set to Copilot or Autopilot, huh???'); // Added for type-safety I guess
    }
    // Removed the try-catch because this shoud be handled by the RCE system now
    // catch (erm) {
    //     const actionName = actionData.name;
    //     notifyOnCaughtException(actionName, erm);
    //     NEURO.client?.sendActionResult(actionData.id, true, `An error occured while executing the action "${actionName}". You may retry if you like, but it may be better to ask Vedal to check what's up.`);
    //     return;
    // }
}

export function giveCookie(isRequested = false, defaultFlavor = 'Chocolate Chip', updateStatus?: SimplifiedStatusUpdateHandler) {
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
            logOutput('INFO', 'No flavor given, cancelling cookie');
            if (isRequested) {
                // Funny quotes if cookie was requested but no flavor given
                const quotes = [
                    `${CONNECTION.userName} couldn't decide on a flavor for your cookie.`,
                    `${CONNECTION.userName} accidentally dropped your cookie.`,
                    `${CONNECTION.userName} ate your cookie.`,
                    `${CONNECTION.userName} made the cookie of types null and void.`,
                    `${CONNECTION.userName} didn't bake the cookie correctly.`,
                    `${CONNECTION.userName} clicked the cookie circle to the beat.`,
                    `${CONNECTION.userName} used the cookie to buy a cursor.`,
                ];
                if (CONNECTION.userName === 'Vedal') {
                    quotes.push(
                        'Vedal\'s robot dog ate the cookie.',
                        'Vedal mixed your cookie into his banana rum.',
                    );
                }
                const randomIndex = Math.floor(Math.random() * quotes.length);
                NEURO.client?.sendContext(quotes[randomIndex]);
                updateStatus?.('failure', `${quotes[randomIndex].replace('your', `${CONNECTION.nameOfAPI}'s`)} (undefined flavor)`);
            }
            return;
        }
        logOutput('INFO', 'Giving cookie to Neuro');
        NEURO.client?.sendContext(`${CONNECTION.userName} gave you a ${flavor} cookie!`);
        updateStatus?.('success', `${flavor} cookie given`);
    });
}

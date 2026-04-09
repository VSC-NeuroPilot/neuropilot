import { NeuroPilotAPI } from '@vsc-neuropilot/api-types';

import { actionHandlerFailure, actionHandlerRetry, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, actionValidationRetry } from '@/utils/neuro_client';
import { RCECancelEvent } from '@events/utils';
import { Companion } from './companions';
import { getAction, getActions } from '@/rce';
import { findByToken } from '@/plugins';
import { isPathNeuroSafe } from '@/utils/misc';

export const api: NeuroPilotAPI = {
    Companion,
    utils: {
        actionValidation: {
            success: actionValidationAccept,
            failure: actionValidationFailure,
            retry: actionValidationRetry,
        },
        actionHandler: {
            success: actionHandlerSuccess,
            failure: actionHandlerFailure,
            retry: actionHandlerRetry,
        },
        actionsListing: {
            getActions(action?: string | string[]) {
                if (typeof action === 'string') {
                    const foundAction = getAction(action);
                    if (!foundAction) return foundAction;
                    const actionReturn = Object.assign(foundAction, { source: findByToken(foundAction.sourceToken)?.name });
                    delete actionReturn?.sourceToken;
                    return actionReturn;
                } else {
                    const actions = getActions(action);
                    return actions.map((a) => {
                        const newObject = Object.assign(a, { source: findByToken(a.sourceToken)?.name });
                        delete newObject.sourceToken;
                        return newObject;
                    });
                };
            },
        },
        diffs: {
            calculateDiffs() { }, // TODO: implement function
        },
        isPathNeuroSafe,
        CancelEvent: RCECancelEvent,
    },
};

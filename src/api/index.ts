import { actionHandlerFailure, actionHandlerRetry, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, actionValidationRetry } from '@/utils/neuro_client';
import { RCECancelEvent } from '@events/utils';
import { NeuroPilotAPI } from '@vsc-neuropilot/api-types';
import { Companion } from './companions';

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
        CancelEvent: RCECancelEvent,
    },
};

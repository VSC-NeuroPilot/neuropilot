import type { CompanionAPI } from '@vsc-neuropilot/api-types';
import crypto from 'node:crypto';
import { addActions, registerAction, removeActions, reregisterAllActions, tryForceActions, unregisterAction } from '@/rce';

export class Companion implements CompanionAPI {
    private readonly token: string;
    addActions = addActions;
    removeActions = removeActions;
    registerAction = registerAction;
    unregisterAction = unregisterAction;
    reregisterAllActions = reregisterAllActions;
    tryForceActions = tryForceActions;
    constructor(_name: string) {
        this.token = crypto.randomUUID();
    }
}

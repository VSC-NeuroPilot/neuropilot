import { ActionForceParams, RCEAction } from '../actions/types';

export class CompanionAPI {
    constructor(name: string);

    addActions(actions: RCEAction[], register?: boolean): void;
    removeActions(actions: string[]): void;
    registerAction(actions: string): void;
    unregisterAction(actions: string): void;
    reregisterAllActions(conservative?: boolean): void;
    tryForceActions(params: ActionForceParams, strict?: boolean): boolean;
}

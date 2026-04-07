import { type RCEAction, RegistryError, type ActionForceParams, type CompanionAPI, CompanionMeta, PermissionError, InjectionBaseData, BaseCompanionError } from '@vsc-neuropilot/api-types';
import crypto from 'node:crypto';
import { Disposable } from 'vscode';

import { addActions, getAction, getActions, registerAction, removeActions, reregisterAllActions, tryForceActions, unregisterAction } from '@/rce';
import { addToRegistry, findByName } from '@/plugins';

export class Companion extends Disposable implements CompanionAPI {
    private readonly data: CompanionMeta;
    private readonly token: CompanionToken;
    addActions(actions: RCEAction[], register?: boolean) {
        if (!this.data.contributes.includes('actions:manage')) throw new PermissionError('addActions', ['actions:manage']);
        addActions(actions, register, this.token);
    };
    removeActions(actionNames: string[]) {
        if (!this.data.contributes.includes('actions:manage')) throw new PermissionError('removeActions', ['actions:manage']);
        const actionList = getActions(actionNames)
            .filter((a) => actionNames.includes(a.name) && a.sourceToken === this.token)
            .map((a) => a.name);
        if (actionList.length === 0) throw new BaseCompanionError('removeActions', 'Couldn\'t find any actions that matched inputs and token.');
        removeActions(actionList, this.token);
    };
    registerAction(action: string) {
        if (!this.data.contributes.includes('actions:manage') || !this.data.contributes.includes('actions:manage_others')) throw new PermissionError('registerAction', ['actions:manage', 'actions:manage_others']);
        if (!this.data.contributes.includes('actions:manage_others')) {
            const actionObject = getAction(action);
            if (actionObject !== undefined && actionObject.sourceToken !== this.token) {
                throw new PermissionError('registerAction', ['actions:manage_others'], `Action "${actionObject.name}" does not belong to this extension.`);
            }
        }
        registerAction(action);
    };
    unregisterAction(action: string) {
        if (!this.data.contributes.includes('actions:manage') || !this.data.contributes.includes('actions:manage_others')) throw new PermissionError('unregisterAction', ['actions:manage', 'actions:manage_others']);
        if (!this.data.contributes.includes('actions:manage_others')) {
            const actionObject = getAction(action);
            if (actionObject !== undefined && actionObject.sourceToken !== this.token) {
                throw new PermissionError('unregisterAction', ['actions:manage_others'], `Action "${actionObject.name}" does not belong to this extension.`);
            }
        }
        unregisterAction(action);
    };
    reregisterAllActions(conservative?: boolean) {
        if (!this.data.contributes.includes('actions:manage') || !this.data.contributes.includes('actions:manage_others')) throw new PermissionError('reregisterAllActions', ['actions:manage', 'actions:manage_others']);
        reregisterAllActions(conservative);
    };
    tryForceActions(p: ActionForceParams, s = false) {
        if (!this.data.contributes.includes('actions:force')) throw new PermissionError('tryForceActions', ['actions:force']);
        return tryForceActions(p, s);
    };
    injectIntoAction(name: string, injectorCallback: (a: InjectionBaseData & { source: string }) => InjectionBaseData, force = false) {
        if (!this.data.contributes.includes('actions:inject')) {
            throw new PermissionError('injectAction', ['actions:inject'], `Attempted to inject into action "${name}"`, this.data.name);
        }
        const action = getAction(name)!; // TODO: add handling for undefined action

        const baseObject: InjectionBaseData & { source: string; } = Object.assign(action, { name: undefined, source: findByName(action.sourceToken) });

        const injectionOverrides = injectorCallback(baseObject);
        const finalObject = Object.assign(baseObject, injectionOverrides, { name: undefined });
        // TODO: rest of injection logic
    }
    constructor(meta: CompanionMeta) {
        super(() => {
            console.log('Companion dispose logic not implemented yet');
        });
        keepTryingRegistration(meta.name);
        this.data = meta;
        this.token = crypto.randomUUID();
    }
}

export type CompanionToken = string;

function keepTryingRegistration(name: string) {
    try {
        addToRegistry(name, crypto.randomUUID());
    } catch(erm) {
        if (erm instanceof RegistryError && erm.message === 'Name is in use.') keepTryingRegistration(name);
        else throw erm;
    }
}

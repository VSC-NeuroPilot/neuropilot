import { type RCEAction, RegistryError, type ActionForceParams, type CompanionAPI, CompanionMeta, PermissionError, InjectionBaseData, BaseCompanionError, ActionsEventData } from '@vsc-neuropilot/api-types';
import crypto from 'node:crypto';
import { Disposable, Position } from 'vscode';

import { addActions, getAction, getActions, registerAction, removeActions, reregisterAllActions, tryForceActions, unregisterAction } from '@/rce';
import { addToRegistry, findByName, removeFromRegistry } from '@/plugins';
import { getVirtualCursor, setVirtualCursor } from '@/utils/misc';
import { onDidMoveCursorEvent } from '@events/cursor';
import { fireCompanionChangeEvent } from '@events/companions';
import { NEURO } from '@/constants';
import { onDidAttemptAction } from '@events/actions';

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
        removeActions(actionList);
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

    injectIntoAction(name: string, injects: Partial<InjectionBaseData>, force = false) {
        if (!this.data.contributes.includes('actions:inject')) {
            throw new PermissionError('injectAction', ['actions:inject'], `Attempted to inject into action "${name}"`, this.data.name);
        }
        const action = getAction(name)!; // TODO: add handling for undefined action

        const injectKeys = Object.keys(injects);

        if (!force && (injectKeys.includes('description') || injectKeys.includes('schema'))) throw new BaseCompanionError('injectIntoAction', 'Cannot inject into description or schema!', 'Attempted to inject into description or schema without force flag.', this.data.name);

        const baseObject: InjectionBaseData & { source: string; } = Object.assign(action, { name: undefined, source: findByName(action.sourceToken) });

        const finalInjects = Object.assign(baseObject, injects, { name: undefined }); // does setting name: undefined even work or does it have to be null
        // TODO: upgrade injection logic to be smarter when removing and readding and all that
        if (!action.injectedBy) action.injectedBy = [];
        action.injectedBy.push({ companion: this.data.name, injects });
        removeActions([action.name]);
        const finalObject = Object.assign(action, finalInjects);
        addActions([finalObject]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDidAttemptAction(listener: (e: ActionsEventData) => any, thisArgs?: any, disposables?: Disposable[]): Disposable {
        if (!this.data.contributes.includes('actions:process')) throw new PermissionError('onDidAttemptAction', ['actions:process']);
        return onDidAttemptAction(listener, thisArgs, disposables);
    }

    sendContext(message: string, silent?: boolean): void {
        if (!this.data.contributes.includes('context')) throw new PermissionError('sendContext', ['context']);
        NEURO.client?.sendContext(`Message from ${this.data.name}: ${message}`, silent);
    }


    getCursor(): Position | null | undefined {
        if (!this.data.contributes.includes('cursor:get')) throw new PermissionError('getCursor', ['cursor:get']);
        return getVirtualCursor();
    }

    setCursor(location?: Position | null): void {
        if (!this.data.contributes.includes('cursor:set')) throw new PermissionError('setCursor', ['cursor:set']);
        return setVirtualCursor(location);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDidMoveCursor(listener: (e: Position | null | undefined) => any, thisArgs?: any, disposables?: Disposable[]): Disposable {
        if (!this.data.contributes.includes('cursor:get')) throw new PermissionError('onDidCursorMove', ['cursor:get']);
        return onDidMoveCursorEvent(listener, thisArgs, disposables);
    };

    constructor(meta: CompanionMeta) {
        super(() => {
            removeFromRegistry(this.token);
            const actionsToRemove = getActions().filter((a) => a.sourceToken === this.token).map((a) => a.name); // TODO: this is a really bad way to do it but the alternative requires a bit of refactoring so leave this for now
            removeActions(actionsToRemove);
            // TODO: hook into the RCE system to cancel all those things if necessary
            fireCompanionChangeEvent({
                name: this.data.name,
                enabled: false,
            });
        });
        keepTryingRegistration(meta);
        this.data = meta;
        this.token = crypto.randomUUID();
        fireCompanionChangeEvent({
            name: this.data.name,
            enabled: true,
        });
    }
}

export type CompanionToken = string;

function keepTryingRegistration(data: CompanionMeta) {
    // TODO: add a timeout / other way to handle throws
    try {
        addToRegistry(data, crypto.randomUUID());
    } catch(erm) {
        if (erm instanceof RegistryError && erm.message !== 'Name is in use.') keepTryingRegistration(data);
        else throw erm;
    }
}

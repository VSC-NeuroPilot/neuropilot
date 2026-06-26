import { type RCEAction, type CompanionAPI, CompanionMeta, PermissionError, InjectionBaseData, BaseCompanionError, Contributions, ActionForceParams } from '@vsc-neuropilot/api-types';
import { Disposable, Position, Uri } from 'vscode';
import crypto from 'node:crypto';
import assert from 'node:assert';

import { abortActionForce, addActions, canForceActions, getAction, getActions, RCEActionPlus, registerAction, removeActions, reregisterAllActions, tryForceActions, unregisterAction } from '@/rce';
import { addToRegistry, findByName, registry, removeFromRegistry } from '@/plugins';
import { getVirtualCursor, setVirtualCursor } from '@/utils/misc';
import { onDidMoveCursorEvent } from '@events/cursor';
import { fireCompanionChangeEvent } from '@events/companions';
import { NEURO } from '@/constants';
import { onDidAttemptAction } from '@events/actions';
import { addChangelogs, deleteChangelogs } from '@/changelog';
import { CompanionMetaWithName } from '@/plugins/utility-types';
import { RCECancelEvent } from '@events/utils';
import { filePreviewProvider } from '@previews/files';
import { createPreviewCursor, createPreviewHighlight, placePreviewCursor, placePreviewHighlight } from '@previews/edits';

export class Companion extends Disposable implements CompanionAPI {
    private readonly data: CompanionMetaWithName;
    private readonly token: CompanionToken;

    actionUtils: CompanionAPI['actionUtils'] = {
        files: {
            markPreviewFiles(uris: Uri[], promptString: string, absolutelyAllFiles = false, noChildren = false) {
                return filePreviewProvider.mark(uris, promptString, absolutelyAllFiles, noChildren);
            },
        },
        edits: {
            setPreviewCursor(position: Position, prompt: string) {
                const decoration = createPreviewCursor();
                placePreviewCursor(decoration, position, prompt);
                return decoration;
            },
            setPreviewHighlight(startPosition: Position, endPosition: Position, prompt: string) {
                const decoration = createPreviewHighlight();
                placePreviewHighlight(decoration, startPosition, endPosition, prompt);
                return decoration;
            },
        },
        CancelEvent: RCECancelEvent,
    };

    isNeuroConnected(): boolean {
        return NEURO.connected;
    }


    @validateContributions(Contributions.ACTIONS_MANAGE)
    addActions(actions: RCEAction[], register?: boolean) {
        addActions(actions, register, this.token);
    };

    @validateContributions(Contributions.ACTIONS_MANAGE)
    removeActions(actionNames: string[]) {
        const actionList = getActions(actionNames)
            .filter((a) => actionNames.includes(a.name) && a.sourceToken === this.token)
            .map((a) => a.name);
        if (actionList.length === 0) throw new BaseCompanionError('removeActions', 'Couldn\'t find any actions that matched inputs and token.');
        removeActions(actionList);
    };

    @validateContributions(Contributions.ACTIONS_MANAGE)
    registerAction(action: string) {
        if (!this.data.contributes.includes(Contributions.ACTIONS_MANAGE_OTHERS)) {
            const actionObject = getAction(action);
            if (actionObject !== undefined && actionObject.sourceToken !== this.token) {
                throw new PermissionError('registerAction', [Contributions.ACTIONS_MANAGE_OTHERS], `Action "${actionObject.name}" does not belong to this extension.`);
            }
        }
        registerAction(action);
    };

    @validateContributions(Contributions.ACTIONS_MANAGE)
    unregisterAction(action: string) {
        if (!this.data.contributes.includes(Contributions.ACTIONS_MANAGE_OTHERS)) {
            const actionObject = getAction(action);
            if (actionObject !== undefined && actionObject.sourceToken !== this.token) {
                throw new PermissionError('unregisterAction', [Contributions.ACTIONS_MANAGE_OTHERS], `Action "${actionObject.name}" does not belong to this extension.`);
            }
        }
        unregisterAction(action);
    };

    @validateContributions(Contributions.ACTIONS_MANAGE, Contributions.ACTIONS_MANAGE_OTHERS)
    reregisterAllActions(conservative?: boolean) {
        reregisterAllActions(conservative);
    };

    @validateContributions(Contributions.ACTIONS_FORCE)
    canForceActions = canForceActions;

    @validateContributions(Contributions.ACTIONS_FORCE)
    tryForceActions = tryForceActions;

    @validateContributions(Contributions.ACTIONS_FORCE)
    getCurrentActionForce(): ActionForceParams | null {
        return NEURO.currentActionForce;
    }

    @validateContributions(Contributions.ACTIONS_FORCE)
    abortActionForce = abortActionForce;

    @validateContributions(Contributions.ACTIONS_INJECT)
    injectIntoAction(name: string, injects: Partial<InjectionBaseData>, force = false) {
        const action = getAction(name);

        assert(action, new BaseCompanionError('injectIntoAction', `The action "${name}" is not registered.`, 'Injecting into an undefined action.', this.data.name));

        const injectKeys = Object.keys(injects);

        if (!force && (injectKeys.includes('description') || injectKeys.includes('schema'))) throw new BaseCompanionError('injectIntoAction', 'Cannot inject into description or schema!', 'Attempted to inject into description or schema without force flag.', this.data.name);

        const token = findByName(action.sourceToken);
        const source = token ? registry[token].name : 'NeuroPilot';
        const baseObject: RCEActionPlus & { source: string; } = { ...action, source };

        const finalInjects: Partial<RCEActionPlus> & { source: string; } = { ...baseObject, ...injects };
        delete finalInjects.name;
        delete finalInjects.sourceToken;
        if (!action.injectedBy) action.injectedBy = [];
        action.injectedBy.push({ companion: this.data.name, injects });
        removeActions([action.name]);
        const finalObject = { ...action, ...finalInjects };
        addActions([finalObject]);
    }

    @validateContributions(Contributions.ACTIONS_PROCESS)
    onActionStatusChanged = onDidAttemptAction;

    @validateContributions(Contributions.CONTEXT)
    sendContext(message: string, silent?: boolean): void {
        NEURO.client?.sendContext(`Message from ${this.data.name}: ${message}`, silent);
    }

    @validateContributions(Contributions.CHANGELOG)
    addChangelog(version: string, changelog: string): void {
        addChangelogs(this.data.name, version, changelog);
    }


    @validateContributions(Contributions.CURSOR_GET)
    getCursor = getVirtualCursor;

    @validateContributions(Contributions.CURSOR_SET)
    setCursor = setVirtualCursor;

    @validateContributions(Contributions.CURSOR_GET)
    onDidMoveCursor = onDidMoveCursorEvent;

    constructor(meta: CompanionMeta) {
        super(() => {
            removeFromRegistry(this.token);
            const actionsToRemove = getActions().filter((a) => a.sourceToken === this.token).map((a) => a.name); // TODO: this is a really bad way to do it but the alternative requires a bit of refactoring so leave this for now
            removeActions(actionsToRemove);
            deleteChangelogs(this.data.name);
            // TODO: hook into the RCE system to cancel all those things if necessary
            fireCompanionChangeEvent({
                name: this.data.name,
                enabled: false,
            });
        });
        const metaObject = { ...meta, name: meta.name ? meta.name : meta.extensionId.split('.')[1] };
        this.data = metaObject;
        this.token = crypto.randomUUID();
        addToRegistry(metaObject, this.token);
        fireCompanionChangeEvent({
            name: this.data.name,
            enabled: true,
        });
    }
}

export type CompanionToken = string;

function validateContributions(...contributions: Contributions[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Decorator must accept any function signature
    return function <This, Value extends (this: This, ...args: any) => any>(
        _value: Value | undefined,
        context: ClassMethodDecoratorContext<This, Value> | ClassFieldDecoratorContext<This, Value>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Decorator return types vary by kind (void for methods, initializer for fields)
    ): any {
        const methodName = typeof context.name === 'string'
            ? context.name
            : context.name.description ?? String(context.name);

        if (context.kind === 'method') {
            // Return a wrapper installed on the prototype that checks permissions at call time,
            // after the constructor has run and this.data has been set.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args must be any for generic method wrapping
            return function (this: This, ...args: any[]): unknown {
                const companionInstance = this as Companion;
                if (!contributions.every((c) => companionInstance['data'].contributes.includes(c))) {
                    throw new PermissionError(methodName, contributions);
                }
                return _value!.apply(this, args);
            } as unknown as Value;
        }

        if (context.kind === 'field') {
            // Return a field initializer that wraps the function value.
            // The wrapper itself does not access this.data — only the call-time check does.
            return function (this: This, initialValue: Value): Value {
                if (typeof initialValue !== 'function') return initialValue;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args must be any for generic function wrapping
                return (function (this: This, ...args: any[]): unknown {
                    const companionInstance = this as Companion;
                    if (!contributions.every((c) => companionInstance['data'].contributes.includes(c))) {
                        throw new PermissionError(methodName, contributions);
                    }
                    return initialValue.apply(this, args);
                }) as unknown as Value;
            };
        }

        const exhaustive: never = context;
        throw new Error(`Unsupported decorator kind: ${(exhaustive as ClassMethodDecoratorContext | ClassFieldDecoratorContext).kind}`);
    };
}

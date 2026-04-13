import { Disposable, Event, Position } from 'vscode';
import { ActionForceParams, ActionsEventData, InjectionBaseData, RCEAction } from '../actions/types';

export class CompanionAPI extends Disposable {
    constructor(data: CompanionMeta);

    /* Action registrations */
    /**
     * Add an action to NeuroPilot's actions registry.
     * You must have declared the `actions:manage` contribution point.
     * @param actions An array of {@link RCEAction actions} that will be registered.
     * @param register Whether or not these actions should be immediately registered to Neuro. This does not effect your ability to register the action at any point, this simply acts as a shorthand.
     */
    addActions(actions: RCEAction[], register?: boolean): void;

    /**
     * Remove an action from NeuroPilot's actions registry.
     * You must have declared the `actions:manage` contribution point.
     * @param actions An array of action names to remove from the registry.
     */
    removeActions(actions: string[]): void;

    /**
     * Registers an action to Neuro.
     * You must have declared either the `actions:manage` or `actions:manage_others` contribution point.
     * @param actions An action name. That action must already have been added via {@link CompanionAPI.addActions}.
     */
    registerAction(action: string): void;

    /**
     * Unregisters an action to Neuro.
     * You must have declared either the `actions:manage` or `actions:manage_others` contribution point.
     * @param actions An action name. That action must already have been added via {@link CompanionAPI.addActions}
     */
    unregisterAction(action: string): void;

    /**
     * Re-attempts to register all actions
     * You must have declared either the `actions:manage` or `actions:manage_others` contribution point.
     * @param conservative If true, only re-register actions as is deemed necessary.
     */
    reregisterAllActions(conservative?: boolean): void;

    /**
     * Try to force an action from Neuro.
     * You must have specified the `actions:force` contribution point.
     * @param params An object describing the action force's parameters.
     * @param strict If true, fails if any action in the parameter object cannot be executed by Neuro, otherwise simply strips out those actions if found.
     * @return `true` if successfully forced an action, `false` otherwise.
     */
    tryForceActions(params: ActionForceParams, strict?: boolean): boolean;

    /**
     * Inject into any registered action and modify most of its properties.
     * You must have specified the `actions:inject` contribution point.
     * @param name The action name to inject into
     * @param injectorCallback The callback for injection data
     * @param force Allows changing the action's description and schema. **Don't set this to true if you don't need it!**
     */
    injectIntoAction(name: string, injectorCallback: Partial<InjectionBaseData>, force?: boolean): void;

    /**
     * Subscribe to the event that fires if an action status was changed.]
     * You must have declared the `actions:process` contribution point.
     * 
     * Note that this event fires when action statuses change, see the example below to filter to actions beginning execution.
     * @example
     * 
     * ```ts
     * companion.onDidAttemptAction((data) => {
     *     if (data.status === 'pending' && data.message === 'Validating action...') {
     *         doSomething(data)
     *     }
     * })
     * ```
     */
    onDidAttemptAction: Event<ActionsEventData>;

    /**
     * Send freeform context to Neuro.
     * You must have specified the `context` contribution point.
     * @param message The context to send to Neuro. Will be formatted as "Message from (companion): "
     * @param silent If false, will prompt Neuro more strongly to react to that context. Defaults to true.
     */
    sendContext(message: string, silent?: boolean): void;

    /* Neuro Cursor */
    /**
     * Get Neuro's current cursor location in the current file.
     * @returns Either a {@link Position} object showing where her cursor is right now, `null` if she can't access the current file, or `undefined` if there is no cursor in the file for whatever reason (such as a read-only editor). 
     */
    getCursor(): Position | null | undefined;

    /**
     * Move Neuro's cursor location.
     * @param location The location to move her cursor to. `null` removes the cursor entirely and `undefined` moves it to the last known location (failing that, an error is logged and no cursor is placed).
     */
    setCursor(location?: Position | null): void;

    /**
     * Subscribe to the event that fires if Neuro's cursor position changed.
     * You must have declared the `cursor:get` contribution point.
     * 
     * The listener will receive the same information as if your companion had called {@link CompanionAPI.getCursor} manually.
     * 
     * See also: {@link Event VS Code's Event type}
     */
    onDidMoveCursor: Event<Position | null | undefined>;
}

export interface CompanionMeta {
    name: string;
    author: string;
    docs: string;
    contributes: CompanionContributions[];
}

export type CompanionContributions =
      'actions:manage' // Add, remove, register and unregister the companion's actions to/from the actions registry
    | 'actions:manage_others' // Register and unregister other companion's actions to/from Neuro.
    | 'actions:inject' // Inject into NeuroPilot's built-in actions (maybe also allow injecting to non-vanilla actions as well?)
    | 'actions:process' // Process actions after RCE
    | 'actions:force' // Force actions from Neuro
    | 'changelog' // Allows Neuro to view the companion's changelog via `get_changelog`
    | 'context' // Send context to Neuro
    | 'cursor:get' // View Neuro's cursor
    | 'cursor:set' // Move Neuro's cursor
    | 'images' // Add to images carousel (here usually for API sanity testing)
    ;

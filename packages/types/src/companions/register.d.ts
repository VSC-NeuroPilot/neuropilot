import { Disposable, Position } from 'vscode';
import { ActionForceParams, InjectionBaseData, RCEAction } from '../actions/types';

export class CompanionAPI extends Disposable {
    constructor(data: CompanionMeta);

    /* Action registrations */
    /**
     * Add an action to NeuroPilot's actions registry.
     * @param actions An array of {@link RCEAction actions} that will be registered.
     * @param register Whether or not these actions should be immediately registered to Neuro. This does not effect your ability to register the action at any point, this simply acts as a shorthand.
     */
    addActions(actions: RCEAction[], register?: boolean): void;

    /**
     * Remove an action from NeuroPilot's actions registry.
     * @param actions An array of action names to remove from the registry.
     */
    removeActions(actions: string[]): void;

    /**
     * Registers an action to Neuro.
     * @param actions An action name. That action must already have been added via {@link CompanionAPI.addActions}.
     */
    registerAction(action: string): void;

    /**
     * Unregisters an action to Neuro.
     * @param actions An action name. That action must already have been added via {@link CompanionAPI.addActions}
     */
    unregisterAction(action: string): void;

    /**
     * Re-attempts to register all actions
     * @param conservative If true, only re-register actions as is deemed necessary.
     */
    reregisterAllActions(conservative?: boolean): void;

    /**
     * Try to force an action from Neuro.
     * @param params An object describing the action force's parameters.
     * @param strict If true, fails if any action in the parameter object cannot be executed by Neuro, otherwise simply strips out those actions if found.
     * @return `true` if successfully forced an action, `false` otherwise.
     */
    tryForceActions(params: ActionForceParams, strict?: boolean): boolean;

    /**
     * Inject into any registered action and modify most of its properties.
     * @param name The action name to inject into
     * @param injectorCallback The callback for injection data
     * @param force Allows changing the action's description and schema. **Don't set this to true if you don't need it!**
     */
    injectIntoAction(name: string, injectorCallback: Partial<InjectionBaseData>, force?: boolean): void;

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

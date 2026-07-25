/**
 * Const enum for companion contributions 
 */
export const enum Contributions {
    /**
     * Allows you to add and remove your own actions from the actions registry.
     * Also allows you to register and unregister them on-demand.
     */
    ACTIONS_MANAGE = 'actions:manage',
    /**
     * Allows you to register and unregister other companions' actions.
     * Does NOT allow you to add or remove them from the registry.
     */
    ACTIONS_MANAGE_OTHERS = 'actions:manage_others',
    /**
     * Allows injecting into other companions' actions.
     * This allows you to change all properties on that action (except for `name` and `source`).
     */
    ACTIONS_INJECT = 'actions:inject',
    /**
     * Allows subscribing to when an action status is changed.
     */
    ACTIONS_PROCESS = 'actions:process',
    /**
     * Allows forcing actions from Neuro.
     * You do not need either {@link Contributions.ACTIONS_MANAGE actions:manage} or {@link Contributions.ACTIONS_MANAGE_OTHERS actions:manage_others} to force actions.
     */
    ACTIONS_FORCE = 'actions:force',
    /**
     * Allows adding changelogs to the `read_changelog` command, so Neuro can query it on-demand.
     */
    CHANGELOG = 'changelog',
    /**
     * Allows sending context to Neuro at any time.
     */
    CONTEXT = 'context',
    /**
     * Allows you to get the virtual cursor position & subscribe to when it gets changed.
     */
    CURSOR_GET = 'cursor:get',
    /**
     * Allows you to set the position of the virtual cursor.
     * This does NOT implicitly grant {@link Contributions.CURSOR_GET cursor:get} and will not let you view the cursor position.
     */
    CURSOR_SET = 'cursor:set',
    /**
     * Currently unused.
     */
    IMAGES = 'images',
};

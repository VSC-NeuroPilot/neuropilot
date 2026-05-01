/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

/** Type of diff range */
export const enum DiffRangeType {
    Added,
    Modified,
    Removed,
}

/**
 * The setting IDs of NeuroPilot's settings.
 * 
 * @example
 * ```ts
 * const nameOfAPI = vscode.workspace.getConfiguration('neuropilot').get<string>(NeuroPilotSetting.NameOfAPI);
 * ```
 */
export const enum NeuroPilotSetting {
    /** The number of lines before the cursor position to include as context when editing a file or sending a completion request. */
    BeforeContext = 'beforeContext',
    /** The number of lines after the cursor position to include as context when editing a file or sending a completion request. */
    AfterContext = 'afterContext',
    /** Whether the real cursor follows Neuro's cursor. */
    CursorFollowsNeuro = 'cursorFollowsNeuro',
    /**
     * Whether to send contents of a file to Neuro when the user switches to it.
     * If false, Neuro will still know what file was switched to, but won't get the contents.
     * Neuro will never get the contents or the name of files that aren't Neuro-safe.
     */
    SendContentsOnFileChange = 'sendContentsOnFileChange',
    /**
     * The style to use for specifying the cursor position in context messages.
     * Possible values are:
     * - `"off"`: Cursor position should not be mentioned to Neuro.
     * - `"inline"`: Cursor position should be denoted by `<<<|>>>`
     * - `"lineAndColumn"`: Cursor position should be reported in <line>:<column> format (one-based).
     * - `"both"`: Combination of `"inline"` and `"lineAndColumn"`.
     */
    CursorPositionContextStyle = 'cursorPositionContextStyle',
    /**
     * The format to use for line numbers in context messages.
     * This format should be prepended to every line.
     * `{n}` is used for the line number. Examples:
     * - `""`
     * - `"{n} "`
     * - `"{n}|"`
     * - `"{n}: "`
     */
    LineNumberContextFormat = 'lineNumberContextFormat',
    /** The URL to connect to the Neuro API. */
    WebsocketUrl = 'connection.websocketUrl',
    /** The game name NeuroPilot reports to the API. */
    GameName = 'connection.gameName',
    /** The name to indicate who is controlling this VS Code instance alongside the API server. This replaces the default name `Vedal`. */
    UserName = 'connection.userName',
    /** The name of the entity currently acting as the API server. You can add custom characters using `settings.json` if you ignore the lint error from VS Code. */
    NameOfAPI = 'connection.nameOfAPI',

    // Commented access.* out for now because companions should use isPathNeuroSafe instead.
    // If we find a use case that is not covered by isPathNeuroSafe then we can add them back.

    // /** Whether to allow Neuro to access files and folders beginning with a dot. */
    // DotFiles = 'access.dotFiles',
    // /** Whether to allow Neuro to access files and folders outside the current workspace. */
    // ExternalFiles = 'access.externalFiles',
    // /**
    //  * Whether to allow Neuro to use environment variables in paths.
    //  * Resolving environent variables isn't implemented in NeuroPilot, so you won't have to implement it in your companion either.
    //  * However, you should still check for it.
    //  */
    // EnvironmentVariables = 'access.environmentVariables',
    // /**
    //  * A case-sensitive list of glob patterns for files Neuro is allowed to open, i.e. she should be unable to open files that don't match this pattern.
    //  * Should be applied before {@link ExcludePattern}.
    //  * 
    //  * Patterns without a slash should match any file or folder with that name.
    //  */
    // IncludePattern = 'access.includePattern',
    // /**
    //  * A case-sensitive glob pattern for files Neuro is not allowed to open.
    //  * Should be applied after {@link IncludePattern}.
    //  * 
    //  * Patterns without a slash should match any file or folder with that name.
    //  */
    // ExcludePattern = 'access.excludePattern',
    // /** Allow NeuroPilot to read ignore patterns from an ignore file (e.g. .gitignore). */
    // InheritFromIgnoreFiles = 'access.inheritFromIgnoreFiles',
    // /**
    //  * A list of ignore-style files to inherit Neuro-safe glob paths from.
    //  * Should support the full range of git's ignore pattern globs and ignore comments (lines starting with #).
    //  * The further down a file is on the list, the more priority it should get.
    //  * 
    //  * This setting should not override any of the other access settings.
    //  * 
    //  * Example: `[ ".gitignore", ".npmignore", ".prettierignore" ]`
    //  */
    // IgnoreFiles = 'access.ignoreFiles',
}

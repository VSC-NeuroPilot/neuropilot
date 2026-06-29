import type { ActionHandlerResult, ActionValidationResult, Diff, DiffPlus, DiffRange, RCEAction, DiffPlusLine, PositionContextOptions, PositionContext, CursorPositionContextStyle } from './actions/types';
import type { CompanionAPI, CompanionAPIConstructor } from './companions/register';
import type * as vscode from 'vscode';

import { ActionForcePriorityEnum as _ActionForcePriorityEnum } from 'neuro-game-sdk';

// don't worry I hate this too
interface ActionForcePriorityEnumInterface {
    /** Sets the priority to low. Is the default for action forces is the `priority` parameter is unspecified. */
    readonly LOW: _ActionForcePriorityEnum.LOW,
    /** Sets the priority to medium. Speeds Neuro's speaking up. */
    readonly MEDIUM: _ActionForcePriorityEnum.MEDIUM,
    /** Sets the priority to high. Processes the action force as soon as possible, which may cause Neuro to speed up or cut herself off. */
    readonly HIGH: _ActionForcePriorityEnum.HIGH,
    /** Sets the priority to critical. Use with caution; will force Neuro to respond at once, immediately.  */
    readonly CRITICAL: _ActionForcePriorityEnum.CRITICAL,
}

/**
 * This is a wrapper re-export around {@link _ActionForcePriorityEnum `neuro-game-sdk`'s ActionForcePriorityEnum}, so we can have proper a proper page for this on docs,
 * and add our own member-level JSDoc annotations.
 * Members are the same as the upstream enum's members.
 * 
 * @example
 * ActionForcePriorityEnum.LOW // equivalent to low priority action force
 * 
 * @see https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md#parameters-5
 */
export const ActionForcePriorityEnum: ActionForcePriorityEnumInterface = {
    LOW: _ActionForcePriorityEnum.LOW,
    MEDIUM: _ActionForcePriorityEnum.MEDIUM,
    HIGH: _ActionForcePriorityEnum.HIGH,
    CRITICAL: _ActionForcePriorityEnum.CRITICAL,
} as const;

interface ActionValidationUtils {
    /**
     * Function to return an object that indicates handler success.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a successful validation result
    */
    success(message?: string, historyNote?: string): ActionValidationResult;
    /**
     * Function to return an object that indicates handler failure.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a failed validation result
     */
    failure(message: string, historyNote?: string): ActionValidationResult;
    /**
     * Function to return an object that indicates handler failure.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a failed validation result
     */
    retry(message: string, historyNote?: string): ActionValidationResult;
}

interface ActionHandlerUtils {
    /**
     * Create a successful action result.
     * This should be used if all parameters have been parsed correctly.
     * @param message An optional message to send to Neuro.
     * @param historyNote A note for the history panel.
     * @returns A successful action result.
     */
    success(message?: string, historyNote?: string): ActionHandlerResult;
    /**
     * Create an action result with the specified message.
     * This should be used if the action failed, but should not be retried, e.g.
     * if the source of the error is out of Neuro's control or to prevent a retry
     * loop in case the action is not applicable in the current state.
     * @param message The message to send to Neuro. This should explain, if possible, why the action failed. If omitted, will just send "Action failed.".
     * @param historyNote A note for the history panel.
     * @returns A successful action result with the specified message.
     */
    failure(message: string, historyNote?: string): ActionHandlerResult;
    /**
     * Create an action result that tells Neuro to retry the forced action.
     * @param message The message to send to Neuro. This should contain the information required to fix the mistake.
     * @param historyNote A note for the history panel.
     * @returns A failed action result with the specified message.
     */
    retry(message: string, historyNote?: string): ActionHandlerResult;
}

export interface NeuroPilotAPI {
    /**
     * Register your companion extension by creating a new object from this class.
     * See {@link CompanionAPI} for the API surface it exposes.
     */
    Companion: CompanionAPIConstructor;
    /**
     * Config values and IDs from NeuroPilot.
     */
    config: NeuroPilotConfig;
    /**
     * Utilities for generating action validation messages
     */
    actionValidation: ActionValidationUtils;
    /**
     * Utililties for generating action handler messages
     */
    actionHandler: ActionHandlerUtils;
    /**
     * Get an action or an array of actions.
     * @todo split into overloads for sanity
     * @param action A string or array of strings of action names.
     * @returns An action (if a string was provided), undefined (if a string was provided and nothing was found), or an array of actions (if nothing or an array was provided)
     */
    getActions(action?: string | string[]): ItselfOrArray<RCEAction & {
        source?: string;
    }> | undefined;
    /**
     * Gets the context around a specified range in a document.
     * If no range is specified, gets the entire document.
     * Do not use the result of this for position calculations, as the file is filtered to remove Windows-style line endings.
     * @param document The document to get the context from.
     * @param options The options for getting the context. If passed a {@link vscode.Position}, it is used as `cursorPosition`, `position` and `position2`.
     * @returns The context around the specified range. The amount of lines before and after the range is configurable in the settings.
     */
    getPositionContext(document: vscode.TextDocument, options: PositionContextOptions | vscode.Position): PositionContext;
    /**
     * Formats the context for sending to Neuro.
     * Assumes the cursor is at the end of `contextBefore` + `contextBetween` and at the start of `contextAfter`.
     * @param context The context to format.
     * @param overrideCursorStyle If provided, overrides the cursor style setting for this context.
     * @returns The formatted context.
     */
    formatContext(context: PositionContext, overrideCursorStyle?: CursorPositionContextStyle): string;
    /**
     * Calculate the diff between two sets of lines using the Patience diff algorithm.
     *
     * The algorithm is not limited to line-based diffs, you can also use it to calculate word- or
     * character-based diffs by splitting your text into arrays of words or characters instead of lines (at
     * the cost of performance).
     * However, documentation and property names still refer to everything as lines.
     * @param oldLines The lines before the change.
     * @param newLines The lines after the change.
     * @see {@link https://github.com/jonTrent/PatienceDiff}
     */
    calculateDiff(oldLines: string[], newLines: string[]): Diff;
    /**
     * Calculate the diff between two sets of lines, taking moved lines into account.
     *
     * Note that moved lines are duplicated in the resulting diff:
     * A line will appear once with `oldIndex` set to the position it was moved from and `newIndex` set to the
     * position it was moved to, and a counterpart of that line will also appear with the same text and
     * `newIndex` set to -1. This is part of the original implementation of the algorithm, which we did not modify.
     * See also: {@link DiffPlusLine.newIndex}
     * @param oldLines The lines before the change.
     * @param newLines The lines after the change.
     * @see {@link NeuroPilotAPI.calculateDiff calculateDiff}
     */
    calculateDiffPlus(oldLines: string[], newLines: string[]): DiffPlus;
    /**
     * Calculates the difference between the original and modified text. The ranges are based on the new text.
     * @param startPosition The position to offset the resulting ranges by.
     * @param oldText The text before the change.
     * @param newText The text after the change.
     * @param tokenRegExp The regular expression used for tokenization. The global flag must be set, and every
     * character in the text must be matched.
     * Defaults to `/\w+|\r?\n|\s+|./g` (word diff).
     * Examples:
     * - Line diff: `/.*(?:\r?\n|$)/g`
     * - Word diff: `/\w+|\r?\n|\s+|./g`
     * - Character diff: `/.|\r?\n/g`
     */
    calculateDiffRanges(startPosition: vscode.Position, oldText: string, newText: string, tokenRegExp?: RegExp): DiffRange[];
    /**
     * Apply diff highlighting to a text editor based on the provided diff ranges.
     * If you use {@link NeuroPilotAPI.calculateDiffRanges calculateDiffRanges} to calculate the
     * diff ranges, the current text in the editor should be provided as the `newText` parameter.
     * @param editor The text editor to highlight.
     * @param diffRanges The diff ranges to highlight.
     * If you use {@link NeuroPilotAPI.calculateDiffRanges calculateDiffRanges} to calculate these,
     * the current text in the editor should be provided as the `newText` parameter.
     */
    applyDiffHighlighting(editor: vscode.TextEditor, diffRanges: DiffRange[]): void;
    /**
     * Checks if a file is Neuro-safe, according to the rules the user has set in NeuroPilot's settings.
     *
     * It is recommended that you use this to check file paths if your actions are accessing a file for any reason.
     * @param path The path to the file. This utility expects an *absolute* path.
     */
    isPathNeuroSafe(path: string): boolean;
}

export interface ConfigValue<T> {
    /** The ID of the setting (without 'neuropilot.' at the start). */
    readonly settingID: string;
    /** The current configuration value. */
    readonly value: T;
}

/**
 * Contains configuration values for NeuroPilot.
 * 
 * Since these values come directly from the settings.json, it is possible that the user inputs an invalid value.
 * NeuroPilot generally assumes that all config values are valid and of the correct type.
 */
export interface NeuroPilotConfig {
    /** The number of lines before the cursor position to include as context when editing a file or sending a completion request. */
    readonly beforeContext: ConfigValue<number>;
    /** The number of lines after the cursor position to include as context when editing a file or sending a completion request. */
    readonly afterContext: ConfigValue<number>;
    /** Whether the real cursor follows Neuro's cursor. */
    readonly cursorFollowsNeuro: ConfigValue<boolean>;
    /**
     * Whether to send contents of a file to Neuro when the user switches to it.
     * If false, Neuro will still know what file was switched to, but won't get the contents.
     * Neuro will never get the contents or the name of files that aren't Neuro-safe.
     */
    readonly sendContentsOnFileChange: ConfigValue<boolean>;
    /**
     * The style to use for specifying the cursor position in context messages.
     * Possible values are:
     * - `"off"`: Cursor position should not be mentioned to Neuro.
     * - `"inline"`: Cursor position should be denoted by `<<<|>>>`
     * - `"lineAndColumn"`: Cursor position should be reported in <line>:<column> format (one-based).
     * - `"both"`: Combination of `"inline"` and `"lineAndColumn"`.
     */
    readonly cursorPositionContextStyle: ConfigValue<'off' | 'inline' | 'lineAndColumn' | 'both'>;
    /**
     * The format to use for line numbers in context messages.
     * This format should be prepended to every line.
     * `{n}` is used for the line number. Examples:
     * - `""`
     * - `"{n} "`
     * - `"{n}|"`
     * - `"{n}: "`
     */
    readonly lineNumberContextFormat: ConfigValue<string>;
    /** The URL to connect to the Neuro API. */
    readonly websocketUrl: ConfigValue<string>;
    /** The game name NeuroPilot reports to the API. */
    readonly gameName: ConfigValue<string>;
    /** The name to indicate who is controlling this VS Code instance alongside the API server. This replaces the default name `Vedal`. */
    readonly userName: ConfigValue<string>;
    /** The name of the entity currently acting as the API server. */
    readonly nameOfAPI: ConfigValue<string>;

    // Commented access.* out for now because companions should use isPathNeuroSafe instead.
    // If we find a use case that is not covered by isPathNeuroSafe then we can add them back.

    // /** Whether to allow Neuro to access files and folders beginning with a dot. */
    // readonly dotFiles: ConfigValue<boolean>;
    // /** Whether to allow Neuro to access files and folders outside the current workspace. */
    // readonly externalFiles: ConfigValue<boolean>;
    // /**
    //  * Whether to allow Neuro to use environment variables in paths.
    //  * Resolving environent variables isn't implemented in NeuroPilot, so you won't have to implement it in your companion either.
    //  * However, you should still check for it.
    //  */
    // readonly environmentVariables: ConfigValue<boolean>;
    // /**
    //  * A case-sensitive list of glob patterns for files Neuro is allowed to open, i.e. she should be unable to open files that don't match this pattern.
    //  * Should be applied before {@link NeuroPilotConfig.excludePattern excludePattern}.
    //  * 
    //  * Patterns without a slash should match any file or folder with that name.
    //  */
    // readonly includePattern: ConfigValue<string[]>;
    // /**
    //  * A case-sensitive glob pattern for files Neuro is not allowed to open.
    //  * Should be applied after {@link NeuroPilotConfig.includePattern includePattern}.
    //  * 
    //  * Patterns without a slash should match any file or folder with that name.
    //  */
    // readonly excludePattern: ConfigValue<string[]>;
    // /** Allow NeuroPilot to read ignore patterns from an ignore file (e.g. .gitignore). */
    // readonly inheritFromIgnoreFiles: ConfigValue<boolean>;
    // /**
    //  * A list of ignore-style files to inherit Neuro-safe glob paths from.
    //  * Should support the full range of git's ignore pattern globs and ignore comments (lines starting with #).
    //  * The further down a file is on the list, the more priority it should get.
    //  * 
    //  * This setting should not override any of the other access settings.
    //  * 
    //  * Example: `[ ".gitignore", ".npmignore", ".prettierignore" ]`
    //  */
    // readonly ignoreFiles: ConfigValue<string[]>;
}

type ItselfOrArray<T> = T | T[];

export * from './actions';
export * from './companions';

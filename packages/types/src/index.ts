import type { RCECancelEvent } from './actions/classes';
import type { ActionHandlerResult, ActionValidationResult, Diff, DiffPlus, DiffRange, RCEAction, DiffPlusLine } from './actions/types';
import type { CompanionAPI } from './companions/register';
import type * as vscode from 'vscode';

interface ActionValidationUtils {
    /**
     * Function to return an object that indicates handler success.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a successful handler result
    */
    success(message?: string, historyNote?: string): ActionValidationResult;
    /**
     * Function to return an object that indicates handler failure.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a failed handler result
     */
    failure(message: string, historyNote?: string): ActionValidationResult;
    /**
     * Function to return an object that indicates handler failure.
     * @param message The message that will be sent to Neuro
     * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
     * @returns {ActionHandlerResult} An object with a failed handler result
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

interface ActionsListingUtils {
    /**
     * Get an action or an array of actions.
     * @param action A string or array of strings of action names.
     * @returns An action (if a string was provided), undefined (if a string was provided and nothing was found), or an array of actions (if nothing or an array was provided)
     */
    getActions(action?: string | string[]): ItselfOrArray<RCEAction & {
        source?: string;
    }> | undefined;
}

interface DiffUtils {
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
     * @see {@link DiffUtils.calculateDiff calculateDiff}
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
     * If you use {@link DiffUtils.calculateDiffRanges calculateDiffRanges} to calculate the
     * diff ranges, the current text in the editor should be provided as the `newText` parameter.
     * @param editor The text editor to highlight.
     * @param diffRanges The diff ranges to highlight.
     * If you use {@link DiffUtils.calculateDiffRanges calculateDiffRanges} to calculate these,
     * the current text in the editor should be provided as the `newText` parameter.
     */
    applyDiffHighlighting(editor: vscode.TextEditor, diffRanges: DiffRange[]): void;
}

interface Utils {
    /**
     * Utilities for generating action validation messages
     */
    actionValidation: ActionValidationUtils;
    /**
     * Utililties for generating action handler messages
     */
    actionHandler: ActionHandlerUtils;
    /**
     * Utilities for the action listing
     */
    actionsListing: ActionsListingUtils;
    /**
     * Utilities for generating and applying diffs
     */
    diffs: DiffUtils;
    /**
     * Checks if a file is Neuro-safe, according to the rules the user has set in NeuroPilot's settings.
     *
     * It is recommended that you use this to check file paths if your actions are accessing a file for any reason.
     * @param path The path to the file. This utility expects an *absolute* path.
     */
    isPathNeuroSafe(path: string): boolean;
    /**
     * Creates a new cancel event for RCE.
     * Make sure to properly dispose of them when you no longer need the cancel events.
     * If you are adding them to the cancel events array of an action, this should automatically be handled.
     */
    CancelEvent: typeof RCECancelEvent;
}

export interface NeuroPilotAPI {
    /**
     * Register your companion extension by creating a new object from this class.
     * See {@link CompanionAPI} for the API surface it exposes.
     */
    Companion: typeof CompanionAPI;
    /**
     * Public, useful utilities you might want to use in your extension.
     */
    utils: Utils;
}

type ItselfOrArray<T> = T | T[];

export * from './actions';
export * from './companions';
export { ActionForcePriorityEnum } from 'neuro-game-sdk';

import * as vscode from 'vscode';
import type { SchemaTypes, InferDataFromSchema, RCEAction, ActionValidationResult, ActionHandlerResult } from '../actions/types';
import { RCECancelEvent, RCECancelEventInitializer, RCEContext } from '../actions';

//#region Context consistency

/**
 * Process a path for usage in context.
 * 
 * Normalizes path separators, and removes the path to the workspace folder.
 * Only uses the folder / file name if the path is outside the workspace folder.
 * @param path The path to process.
 */
// Original name: simpleFileName
export function contextPath(path: string): string {
    const rootFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.replace(/\\/, '/');
    const result = path.replace(/\\/g, '/');
    if (rootFolder && result.startsWith(rootFolder))
        return result.substring(rootFolder.length);
    else
        return result.substring(result.lastIndexOf('/') + 1);
}

/**
 * Process the contents of a text file for usage in context.
 * 
 * Removes Windows-style line endings.
 * @param content The file contents to process.
 */
// Original name: filterFileContents
export function contextFileContent(content: string): string {
    return content.replace(/\r\n/g, '\n');
}

//#endregion

//#region General consistency

/**
 * Return the string that would be inserted for the specified match.
 * 
 * Similar to {@link String.replace}, but returns the string instead of replacing directly.
 * @param match A single match returned by matching a regular expression.
 * @param replacement The replacement string, which can contain substitutions.
 * Supports JavaScript-style and .NET-style substitutions.
 * The substitutions `` $` ``, `$'` and `$_` are not supported.
 * @returns The substituted string.
 * @throws Error if the substitution is invalid or if the capture group does not exist.
 */
export function substituteMatch(match: RegExpExecArray, replacement: string): string {
    const rx = /\$<.+?>|\${.+?}|\$\d+|\$./g;
    const substitutions = Array.from(replacement.matchAll(rx));
    const literals = replacement.split(rx);
    let result = '';
    for (let i = 0; i < substitutions.length; i++) {
        const currentSub = substitutions[i]!;
        // Append literal
        result += literals[i];
        // Append substitution
        if (currentSub[0] === '$&') {
            // Full match
            result += match[0];
        }
        else if (currentSub[0] === '$`' || currentSub[0] === '$\'' || currentSub[0] === '$_') {
            // Text before or after the match
            throw new Error('Substitution with text outside the match is not supported.');
        }
        else if (currentSub[0] === '$+') {
            // Last capture group
            if (match.length === 0)
                throw new Error('No capture groups in the match');
            result += match[match.length - 1];
        }
        else if (currentSub[0] === '$$') {
            // Escaped dollar sign
            result += '$';
        }
        else if (currentSub[0].startsWith('$<') || currentSub[0].startsWith('${')) {
            const name = currentSub[0].slice(2, -1);
            if (/^\d+$/.test(name)) {
                // Numbered group
                const index = parseInt(name);
                if (index >= match.length)
                    throw new Error(`Capture group ${index} does not exist in the match`);
                result += match[index];
            }
            else {
                // Named group
                const content = match.groups?.[name];
                if (content === undefined)
                    throw new Error(`Capture group "${name}" does not exist in the match`);
                result += content;
            }
        }
        else if (/^\$\d+$/.test(currentSub[0])) {
            // Numbered group
            const index = parseInt(currentSub[0].slice(1));
            if (index >= match.length)
                throw new Error(`Capture group ${index} does not exist in the match`);
            result += match[index];
        }
        else {
            // No substitution, just append the string
            result += currentSub[0];
        }
    }
    // Append remaining literal
    result += literals[literals.length - 1];
    return result;
}

/**
 * Split an identifier into an array of words. Handles camelCase, PascalCase, snake_case and kebab-case.
 * @param str The string to split.
 */
export function splitIdentifier(str: string): string[] {
    const rx = /[A-Z]{1,}(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[A-Z]+|\d+|_|-/g;
    return Array.from(str.matchAll(rx))
        .map(m => m[0])
        .filter(part => part !== '_' && part !== '-');
}

/**
 * Convert a string to Title Case using {@link splitIdentifier}.
 * @param str 
 * @returns 
 */
export function toTitleCase(str: string): string {
    const allCaps = str.toUpperCase() === str;
    const parts = splitIdentifier(str);
    const excludedWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'off', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'yet'];
    return parts
        .map((part, i) => {
            if (!allCaps && part.toUpperCase() === part)
                return part;
            const lowerPart = part.toLowerCase();

            if (i && excludedWords.includes(lowerPart)) {
                return lowerPart;
            } else {
                return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
            }
        })
        .join(' ');
}

/**
 * Turn an arbitrary string into a valid action name.
 * 
 * Converts the string to snake_case by replacing any series of non-alphanumeric characters into an underscore.
 * This is NOT a unique name generator, the same action name may be generated from different inputs.
 * @param name The name to convert. Should contain at least one alphanumeric character.
 * @returns 
 */
export function formatActionName(name: string): string {
    // Action IDs must be snake_case
    return name
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .toLowerCase();
}

/**
 * Get the main workspace URI (i.e. the workspace Neuro can interact with),
 * or `undefined` if no workspace is open.
 */
export function getWorkspaceUri(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}


/**
 * Normalize a path for comparisons.
 * 
 * Replaces Windows-style path separators with Unix-style ones.
 * If the path has a drive letter, makes it lowercase.
 * @param path The path to normalize.
 */
export function normalizePath(path: string): string {
    let result = path.replace(/\\/g, '/');
    if (/^[A-Z]:/.test(result)) {
        result = result.charAt(0).toLowerCase() + result.slice(1);
    }
    return result;
}

//#endregion

//#region Useful stuff

/**
 * Escape RegExp control characters.
 * Useful if search text may contain control character.
 * @param string The string to escape.
 * @returns The escaped string.
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Searches for the longest fence (at least 3 backticks in a row) in the given text.
 * 
 * Enclosing fences should have at least one backtick more than this, and at least three.
 * @see https://spec.commonmark.org/0.12/#fenced-code-blocks
 * @param text The text to search for fences in.
 * @returns The length of the longest fence found in the text, or 0 if no fences were found.
 */
export function getMaxFenceLength(text: string): number {
    return text.match(/`{3,}/g)?.reduce((a, b) => Math.max(a, b.length), 0) ?? 0;
}

/**
 * Gets the minimum fence required to enclose the given text.
 * @param text The text to search for fences in.
 * @returns The minimum fence required to enclose the text.
 */
// Original name: getFence
export function getRequiredFence(text: string): string {
    const maxFenceLength = getMaxFenceLength(text);
    return '`'.repeat(maxFenceLength ? maxFenceLength + 1 : 3);
}

//#endregion

/**
 * Define an action with proper type inference for schema, input data, and event types.
 * @param action The action definition
 * @returns The same action with full type inference
 * @example
 * defineAction({
 *   name: 'my_action',
 *   schema: z.object({ file: z.string() }),
 *   handler: (ctx) => actionHandlerSuccess(),
 *   cancelEvents: [(ctx) => new RCECancelEvent<vscode.FileDeleteEvent>({ ... })],
 *   // ...
 * });
 */
/* @__NO_SIDE_EFFECTS__ */
export function defineAction<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
>(action: RCEAction<TData, TSchema, TInput>): typeof action {
    return action;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineValidator<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
    const TReturn extends ActionValidationResult | Thenable<ActionValidationResult>,
>(validator: (ctx: RCEContext<TData, TSchema, TInput>) => TReturn): typeof validator {
    return validator;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineHandler<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
    const TReturn extends ActionHandlerResult | Thenable<ActionHandlerResult>,
>(handler: (ctx: RCEContext<TData, TSchema, TInput>) => TReturn): typeof handler {
    return handler;
};

/* @__NO_SIDE_EFFECTS__ */
export function definePreviewEffect<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
    const TReturn extends { disopse: () => unknown },
>(preview: (ctx: RCEContext<TData, TSchema, TInput>) => TReturn): typeof preview {
    return preview;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineCancelEvent<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
    const TEventData extends unknown | undefined,
    const TReturn extends RCECancelEvent<TEventData> | null,
>(event: (ctx: RCEContext<TData, TSchema, TInput>) => TReturn): typeof event {
    return event;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineCancelEventInitializer<const T extends unknown | undefined>(init: RCECancelEventInitializer<T>): typeof init {
    return init;
}

/* @__NO_SIDE_EFFECTS__ */
export function defineEventInfoArray<const T extends unknown | undefined>(eventInfo: [vscode.Event<T>, ((event: T) => boolean | Promise<boolean>) | null]): typeof eventInfo {
    return eventInfo;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineEventPredicate<
    const T extends unknown | undefined,
    const TReturn extends boolean | Promise<boolean>,
>(predicate: (event: T) => TReturn): typeof predicate {
    return predicate;
};

/* @__NO_SIDE_EFFECTS__ */
export function definePromptGenerator<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
>(generator: (ctx: RCEContext<TData, TSchema, TInput>) => string): typeof generator {
    return generator;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineReasonGenerator<
    const TEventData extends unknown | undefined,
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
>(generator: (ctx: RCEContext<TData, TSchema, TInput>, event: TEventData) => string): typeof generator {
    return generator;
};

/* @__NO_SIDE_EFFECTS__ */
export function defineSetupHook<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
    const TReturn extends void | Thenable<void>,
>(hook: (ctx: RCEContext<TData, TSchema, TInput>) => TReturn): typeof hook {
    return hook;
};

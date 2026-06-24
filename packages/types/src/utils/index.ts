import * as vscode from 'vscode';

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

import * as vscode from 'vscode';
import { ActionHandlerResult, PermissionLevel } from '@vsc-neuropilot/api-types';
import { defineAction } from '@vsc-neuropilot/api-types/utils';
import { z } from 'zod';

import { EXCEPTION_THROWN_STRING, NEURO } from '@/constants';
import { logOutput } from '@/utils/misc';
import { actionHandlerFailure, actionHandlerSuccess } from '@/utils/neuro_client';
import { CONNECTION } from '@/config';
import { addActions, CATEGORY_MISC } from './rce';
import { getRequiredFence } from '@vsc-neuropilot/api-types/utils';

const MEMENTO_KEY = 'lastDeliveredChangelogVersion';

interface ChangelogSection {
    version: string;
    body: string;
}

export const changelogs: Record<string, ChangelogSection[]> = {};

export function addChangelogs(name: string, version: string, body: string): void {
    if (!changelogs[name]) {
        changelogs[name] = [];
    }
    const companionChangelogs = changelogs[name];
    const changelogToReplace = companionChangelogs.findIndex((v) => v.version === version);
    if (changelogToReplace === -1) changelogs[name].push({ version, body });
    else changelogs[name][changelogToReplace].body = body;
};

export function deleteChangelogs(name: string): void {
    delete changelogs[name];
}

/**
 * Load all changelog versions from CHANGELOG.md on extension activation.
 * This populates the changelogs object with all available versions.
 */
export async function loadAllChangelogs(): Promise<void> {
    try {
        const { sections } = await readAndParseChangelog();
        for (const section of sections) {
            addChangelogs('NeuroPilot', section.version, section.body);
        }
        logOutput('INFO', `Loaded ${sections.length} changelog versions`);
    } catch (erm) {
        logOutput('ERROR', `Failed to load changelogs on activation: ${erm}`);
    }
}

export const changelogActions = {
    read_changelog: defineAction({
        name: 'read_changelog',
        description: 'Get changelog entries starting from a specified version. If fromVersion is omitted, any new entries after the last read_changelog command are read.',
        category: CATEGORY_MISC,
        schema: z.object({
            name: z.string().optional().meta({
                description: 'Name of the companion to view changelogs for. Defaults to the normal NeuroPilot changelogs',
            }).optional(),
            fromVersion: z.string().meta({
                description: 'Version (e.g., 2.2.1) to start including entries from, inclusive.',
            }).optional(),
        }),
        defaultPermission: PermissionLevel.COPILOT,
        handler: (ctx) => handleReadChangelog(ctx.data.params.name, ctx.data.params.fromVersion),
        promptGenerator: (context) => context.data.params.fromVersion
            ? `read all ${context.data.params?.name ?? 'NeuroPilot'} changelog entries starting from version ${context.data.params.fromVersion} (inclusive).`
            : `read the latest changelog entries for ${context.data.params?.name ?? 'NeuroPilot'}.`,
    }),
};

export function addChangelogActions(): void {
    addActions([changelogActions.read_changelog]);
}

/**
 * Read and structure changelog entries from the preloaded changelogs object.
 * @param name - Name of the companion to read changelogs for (defaults to 'NeuroPilot')
 * @param fromVersion - Optional version to start from (inclusive)
 * @returns Action handler result with formatted changelog entries
 */
export async function readAndStructureChangelog(name = 'NeuroPilot', fromVersion?: string): Promise<ActionHandlerResult> {
    try {
        const sections = changelogs[name];
        if (!sections || sections.length === 0) {
            return actionHandlerFailure(`Could not find any changelog entries for ${name}.`, 'No changelog entries found');
        }

        // Sort sections by version (latest first) to ensure correct ordering
        const sortedSections = [...sections].sort((a, b) => compareVersions(b.version, a.version));
        const latest = findLatestVersion(sections);
        let saved;
        if (name === 'NeuroPilot') saved = NEURO.context?.globalState.get<string>(MEMENTO_KEY);
        const { selected, startVersion, endVersion, note } = computeSelection(sortedSections, latest, saved, fromVersion);

        if (selected.length === 0) {
            return actionHandlerFailure('No matching changelog entries to send.', 'No matching changelog entries found');
        }

        const md = selected.map(s => `## ${s.version}\n\n${s.body.trim()}`).join('\n\n');
        const fence = getRequiredFence(md);
        const messageParts: string[] = [];
        messageParts.push(`Changelog entries from ${startVersion} to ${endVersion}:`);
        if (note) messageParts.push(note);
        messageParts.push('\n');
        messageParts.push(`${fence}markdown\n${md}\n${fence}`);

        // Update memento to latest delivered
        if (name === 'NeuroPilot') await NEURO.context?.globalState.update(MEMENTO_KEY, endVersion);

        return actionHandlerSuccess(messageParts.join('\n') + `\nPlease summarise the changelogs for ${CONNECTION.userName}.`, 'Sent requested changelog');
    } catch (erm) {
        logOutput('ERROR', `Failed to read changelog: ${erm}`);
        return actionHandlerFailure('Failed to read changelog.', EXCEPTION_THROWN_STRING);
    }
}

export async function sendChangelogOnDemand() {
    if (!NEURO.connected) {
        vscode.window.showErrorMessage('Not connected to the Neuro API');
        return;
    }

    const changelog = await readAndStructureChangelog();
    if (changelog.success === 'success') {
        NEURO.client?.sendContext(changelog.message!);
    } else {
        vscode.window.showErrorMessage(changelog.message ?? 'Reading and structuring the changelog failed, maybe check logs?');
    }
}

function handleReadChangelog(name = 'NeuroPilot', version?: string): Thenable<ActionHandlerResult> {
    return readAndStructureChangelog(name, version);
}

/**
 * Read and parse the changelog file from disk.
 * @internal Used only during extension activation to populate the changelogs object.
 * @returns Parsed changelog sections and the latest version
 */
async function readAndParseChangelog(): Promise<{ sections: ChangelogSection[]; latest: string; }> {
    const uri = vscode.Uri.joinPath(NEURO.context!.extensionUri, 'CHANGELOG.md');
    const data = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8').decode(data);

    // Remove HTML comments (<!-- ... -->) so commented content is not sent to Neuro
    const cleanedText = text.replace(/<!--[\s\S]*?-->/g, '');

    const sections = parseChangelog(cleanedText);
    const latest = findLatestVersion(sections);
    return { sections, latest };
}

/**
 * Parse changelog text and extract version sections.
 * @internal Helper function used during changelog initialization.
 * @param text - Raw changelog text
 * @returns Array of changelog sections (latest first)
 */
function parseChangelog(text: string): ChangelogSection[] {
    const headerRegex = /^##\s+(\d+\.\d+\.\d+)\s*$/gm;
    const matches: { version: string; index: number; }[] = [];
    let m: RegExpExecArray | null;
    while ((m = headerRegex.exec(text)) !== null) {
        matches.push({ version: m[1], index: m.index });
    }
    const sections: ChangelogSection[] = [];
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const block = text.slice(start, end).trim();
        // Remove the "## x.y.z" line from body when storing
        const body = block.replace(/^##\s+\d+\.\d+\.\d+\s*\r?\n/, '');
        sections.push({ version: matches[i].version, body });
    }
    // Return sections in document order (typically latest-first, but order is handled elsewhere)
    return sections;
}

/**
 * Compare two semantic version strings.
 * @param a - First version string (e.g., '2.5.0')
 * @param b - Second version string (e.g., '2.4.1')
 * @returns Positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;

        if (aPart !== bPart) {
            return aPart - bPart;
        }
    }

    return 0;
}

/**
 * Find the latest version from an array of changelog sections.
 * @param sections - Array of changelog sections (may be in any order)
 * @returns The latest version string, or '0.0.0' if no sections exist
 */
function findLatestVersion(sections: ChangelogSection[]): string {
    if (sections.length === 0) return '0.0.0';

    return sections.reduce((latest, section) => {
        return compareVersions(section.version, latest) > 0 ? section.version : latest;
    }, sections[0].version);
}

function computeSelection(
    latestFirst: ChangelogSection[],
    latest: string,
    saved: string | undefined,
    provided?: string,
): { selected: ChangelogSection[]; startVersion: string; endVersion: string; note?: string } {
    const versions = latestFirst.map(s => s.version);

    let startIdx: number | undefined;
    let startVersion: string | undefined;
    let note: string | undefined;

    // 1) If provided and found, start there; if provided but not found, fall back to default and note it
    if (provided) {
        const idx = versions.indexOf(provided);
        if (idx !== -1) {
            startIdx = idx;
            startVersion = provided;
        } else {
            note = `Note: requested start version ${provided} was not found; using defaults.`;
        }
    }

    // 2) Defaults if not decided yet
    if (startIdx === undefined) {
        if (!saved) {
            // Default to 2.3.0 if present; otherwise, oldest available
            const idx230 = versions.indexOf('2.3.0');
            startIdx = idx230 !== -1 ? idx230 : versions.length - 1;
            startVersion = versions[startIdx];
        } else {
            const savedIdx = versions.indexOf(saved);
            if (savedIdx === -1) {
                const idx230 = versions.indexOf('2.3.0');
                startIdx = idx230 !== -1 ? idx230 : versions.length - 1;
                startVersion = versions[startIdx];
            } else if (saved === latest) {
                // If saved is latest, deliver latest again
                startIdx = versions.indexOf(latest);
                startVersion = latest;
            } else {
                // New versions after saved: indices [0..savedIdx-1]; start from the oldest among them
                startIdx = Math.max(0, savedIdx - 1);
                startVersion = versions[startIdx];
            }
        }
    }

    // Build selection from startIdx to 0 (toward latest), but output oldest→latest
    const endIdx = 0; // latest index in latest-first ordering
    const slice = latestFirst.slice(endIdx, startIdx! + 1); // indices [0..startIdx]
    const subsetLatestFirst = slice.reverse(); // oldest → latest

    const selected = subsetLatestFirst;
    const endVersion = selected[selected.length - 1].version;
    return { selected, startVersion: startVersion!, endVersion, note };
}

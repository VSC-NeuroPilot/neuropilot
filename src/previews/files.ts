import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { isPathNeuroSafe } from '@/utils/misc';

interface MarkedEntry {
    prompt?: string;
    allowUnsafe: boolean;
    noChildren: boolean;
}

class PreviewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private _em = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._em.event;

    // internal state that provideFileDecoration will read
    // Maps URI string to marked entry with per-URI settings
    private marked = new Map<string, MarkedEntry>();
    // Cache which marked URIs are directories
    private directories = new Set<string>();

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const symbol = NEURO.currentController === 'Neuro' ? '💜' : NEURO.currentController === 'Evil' ? '💔' : '🖥️';
        const uriString = uri.toString();

        // Check if the URI itself is marked (exact string match)
        const entry = this.marked.get(uriString);
        if (entry) {
            const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${entry.prompt ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
            dec.propagate = true; // Propagate to parent folders
            return dec;
        }

        // Normalize paths for comparison (remove trailing slashes)
        const uriPath = uri.path.replace(/\/+$/, '');

        // Check if any parent folder is marked (for child propagation) or if paths match
        for (const [markedUriString, markedEntry] of this.marked.entries()) {
            // Skip if this marked entry doesn't allow children
            if (markedEntry.noChildren) {
                continue;
            }

            const markedUri = vscode.Uri.parse(markedUriString);
            const markedPath = markedUri.path.replace(/\/+$/, '');

            // Check if paths are exactly equal (handles URI string differences like trailing slashes)
            if (uriPath === markedPath) {
                const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${markedEntry.prompt ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
                dec.propagate = true; // Propagate to parent folders
                return dec;
            }

            // Check if this URI is a child of the marked folder using path comparison
            if (uriPath.startsWith(markedPath + '/')) {
                // Skip if the child is not Neuro-safe (unless bypass is enabled for this entry)
                if (!markedEntry.allowUnsafe && !isPathNeuroSafe(uri.fsPath)) {
                    continue;
                }

                // Check if the marked URI is a directory (from cached Set)
                if (this.directories.has(markedUriString)) {
                    const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${markedEntry.prompt ?? 'uhhhh, do something with this folder?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
                    dec.propagate = false; // Don't propagate children up to unmarked parents
                    return dec;
                }
            }
        }

        return undefined;
    }

    // PUBLIC API: mark multiple files/folders at once
    // Returns a Disposable that unmarks the URIs when disposed
    public mark(uris: vscode.Uri[], promptString?: string, absolutelyAllFiles = false, noChildren = false): vscode.Disposable {
        const markedUris = [...uris]; // Create a copy to capture the URIs for this marking

        for (const uri of uris) {
            const uriString = uri.toString();
            this.marked.set(uriString, {
                prompt: promptString,
                allowUnsafe: absolutelyAllFiles,
                noChildren: noChildren,
            });
            // Precompute directory status asynchronously to avoid blocking provideFileDecoration
            vscode.workspace.fs.stat(uri).then(
                (stat) => {
                    if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
                        this.directories.add(uriString);
                        // Refresh decorations after discovering it's a directory
                        this._em.fire(undefined);
                    }
                },
                () => {
                    // Stat failed, not a directory (or doesn't exist yet)
                },
            );
        }
        // Fire undefined to refresh all decorations, ensuring children get checked
        this._em.fire(undefined);

        // Return a disposable that unmarks these specific URIs
        return {
            dispose: () => {
                this.unmark(markedUris);
            },
        };
    }

    // PUBLIC API: unmark a file
    public unmark(uris: vscode.Uri[]) {
        let needsFullRefresh = false;
        for (const uri of uris) {
            const uriString = uri.toString();
            const entry = this.marked.get(uriString);

            // If this entry allowed children or is a known directory, we need to refresh all decorations
            if (entry && !entry.noChildren) {
                needsFullRefresh = true;
            }
            if (this.directories.has(uriString)) {
                this.directories.delete(uriString);
                needsFullRefresh = true;
            }

            this.marked.delete(uriString);
        }
        // If any entry could have had children, refresh all decorations to clear them
        // Otherwise just refresh the specific URIs
        this._em.fire(needsFullRefresh ? undefined : uris);
    }

    // PUBLIC API: clear all marked files
    public clearAll() {
        this.marked.clear();
        this.directories.clear();
        this._em.fire(undefined);
    }

    // PUBLIC API: refresh arbitrary URIs (or all if undefined)
    public refresh(uris?: vscode.Uri | vscode.Uri[]) {
        this._em.fire(uris);
    }

    dispose() {
        this._em.dispose();
    }
}

export const filePreviewProvider = new PreviewFileDecorationProvider();

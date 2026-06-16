import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { BaseWebviewViewProvider } from './base';
import { logOutput } from '@/utils/misc';
import { COSMETIC } from '../config';
import type { ImagesViewMessage, ImagesViewProviderMessage, GalleryConfig, ImageSet, ImageData } from '@typing/views/images';

export class ImagesViewProvider extends BaseWebviewViewProvider<ImagesViewMessage, ImagesViewProviderMessage> {
    public static readonly viewId = 'neuropilot.imagesView';

    private config: GalleryConfig | null = null;
    private disposables: vscode.Disposable[] = [];
    private _configListener: vscode.Disposable | null = null;

    constructor() {
        super('images/main.js', ['images/style.css']);
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

    protected async onViewReady(): Promise<void> {
        if (this.config === null) {
            try {
                await this.loadConfig();
            } catch (erm) {
                console.error('Failed to load config:', erm);
            }

            // Subscribe to configuration changes only once
            if (!this._configListener) {
                this._configListener = vscode.workspace.onDidChangeConfiguration((e) => {
                    if (e.affectsConfiguration('neuropilot.cosmetic.celebrations')) {
                        this.sendUpdateToView().catch(erm =>
                            console.error('Failed to send update on config change:', erm),
                        );
                    }
                });
                this.disposables.push(this._configListener);
            }
        }

        // Always send update when view becomes ready
        try {
            await this.sendUpdateToView();
        } catch (erm) {
            console.error('Failed to send initial update:', erm);
        }
    }

    /**
     * Load the gallery configuration from sets.json
     */
    private async loadConfig(): Promise<void> {
        try {
            const configUri = vscode.Uri.joinPath(NEURO.context!.extensionUri, 'image-gallery', 'sets.json');
            const data = await vscode.workspace.fs.readFile(configUri);
            const text = new TextDecoder('utf-8').decode(data);
            this.config = JSON.parse(text) as GalleryConfig;
        } catch (erm) {
            logOutput('ERROR', 'Failed to load image gallery config:' + erm);
            this.config = { version: 1, sets: {} };
        }
    }

    /**
     * Convert gallery config to message format
     */
    private getSetsForMessage(includeRotations = true): Record<string, ImageSet> {
        if (!this.config) return {};

        const result: Record<string, ImageSet> = {};

        for (const [setName, setData] of Object.entries(this.config.sets)) {
            // Skip rotation sets if not including them
            if (!includeRotations && setData.rotation) continue;

            result[setName] = {
                description: setData.description,
                images: setData.images.map(img => ({
                    name: img.name,
                    path: this.getWebviewUri(setName, img.filePath).toString(),
                    credits: img.attributions,
                })),
            };
        }

        return result;
    }

    /**
     * Send filtered sets to the webview (webview handles image selection)
     */
    private async sendUpdateToView(): Promise<void> {
        if (!this._view) return;

        // Ensure config is loaded
        if (this.config === null) {
            await this.loadConfig();
        }

        if (!this.config) return;

        const includeRotations = COSMETIC.celebrations;
        const setsForMsg = this.getSetsForMessage(includeRotations);

        const setNames = Object.keys(setsForMsg);
        if (setNames.length === 0) {
            // Nothing to show — send empty sets list
            this.postMessage({ type: 'setList', sets: setNames });
            return;
        }

        // Pick a random image for initial display
        const randSet = setNames[Math.floor(Math.random() * setNames.length)];
        const imgs = setsForMsg[randSet].images;
        if (imgs.length === 0) {
            this.postMessage({ type: 'setList', sets: setNames });
            return;
        }
        const randImg = imgs[Math.floor(Math.random() * imgs.length)];

        const imageToSend: ImageData = {
            name: randImg.name,
            path: randImg.path,
            credits: randImg.credits,
            set: { name: randSet, description: setsForMsg[randSet].description },
        };

        // Send sets with initial random image
        this.postMessage({
            type: 'newImage',
            image: imageToSend,
            sets: setsForMsg,
        });
    }

    /**
     * Get a webview-safe URI for an image
     */
    private getWebviewUri(setName: string, filePath: string): vscode.Uri {
        const imageUri = vscode.Uri.joinPath(
            NEURO.context!.extensionUri,
            'image-gallery',
            setName,
            filePath,
        );
        return this._view?.webview.asWebviewUri(imageUri) ?? imageUri;
    }

    protected handleMessage(message: ImagesViewMessage): void {
        switch (message.type) {
            case 'updateSets':
            case 'viewReady':
                // Webview is requesting image sets
                void this.sendUpdateToView();
                break;

            default:
                // All other operations are now handled in the webview
                break;
        }
    }
}

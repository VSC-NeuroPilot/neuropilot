import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { BaseWebviewViewProvider } from './base';
import { logOutput } from '../utils';
import { COSMETIC } from '../config';

export interface ImageData {
    name: string;
    path: string;
    credits: string;
    set: {
        name: string;
        description: string;
    };
}

export type ImagesViewProviderMessage = {
    type: 'newImage';
    image: ImageData;
    sets: Record<string, ImageSet>;
} | {
    type: 'searchResult';
    names: string[];
} | {
    type: 'setList';
    sets: string[];
};

export type ImagesViewMessage = {
    type: 'randomImage' | 'randomSet' | 'searchSet';
} | {
    type: 'searchImage' | 'switchSet' | 'switchImage';
    name: string;
} | {
    type: 'nextImage' | 'previousImage' | 'randomImageInSet';
    current: string;
} | {
    type: 'viewReady';
} | {
    type: 'updateSets';
};

interface GallerySet {
    title: string;
    rotation: boolean;
    description: string;
    images: {
        name: string;
        filePath: string;
        attributions: string;
    }[];
}

interface GalleryConfig {
    version: number;
    sets: Record<string, GallerySet>;
}

export interface ImageSet {
    description: string;
    images: Omit<ImageData, 'set'>[];
}

export class ImagesViewProvider extends BaseWebviewViewProvider<ImagesViewMessage, ImagesViewProviderMessage> {
    public static readonly viewType = 'neuropilot.imagesView';

    private config: GalleryConfig | null = null;
    private currentSet: string | null = null;
    private currentImageName: string | null = null;
    private disposables: vscode.Disposable[] = [];
    private _configListener: vscode.Disposable | null = null;

    constructor() {
        super('images/index.html', 'images/main.js', ['images/style.css']);
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
     * Send an update to the webview with filtered sets and appropriate image
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

        // Check whether current image still exists in filtered sets
        let imageToSend: ImageData | null = null;
        if (this.currentSet && this.currentImageName) {
            const setImages = setsForMsg[this.currentSet]?.images ?? [];
            const found = setImages.find(i => i.name === this.currentImageName);
            if (found) {
                imageToSend = {
                    name: found.name,
                    path: found.path,
                    credits: found.credits,
                    set: { name: this.currentSet, description: setsForMsg[this.currentSet].description },
                };
            }
        }

        // Fallback: pick random image from the filtered sets
        if (!imageToSend) {
            const setNames = Object.keys(setsForMsg);
            if (setNames.length === 0) {
                // Nothing to show — send empty sets list
                this.postMessage({ type: 'setList', sets: setNames });
                return;
            }
            const randSet = setNames[Math.floor(Math.random() * setNames.length)];
            const imgs = setsForMsg[randSet].images;
            if (imgs.length === 0) {
                this.postMessage({ type: 'setList', sets: setNames });
                return;
            }
            const randImg = imgs[Math.floor(Math.random() * imgs.length)];
            imageToSend = {
                name: randImg.name,
                path: randImg.path,
                credits: randImg.credits,
                set: { name: randSet, description: setsForMsg[randSet].description },
            };

            // Update provider current pointers
            this.currentSet = randSet;
            this.currentImageName = randImg.name;
        }

        // Post authoritative update (image + sets)
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

    /**
     * Get a random set name
     */
    private getRandomSetName(): string | null {
        if (!this.config) return null;
        const setNames = Object.keys(this.config.sets);
        if (setNames.length === 0) return null;
        return setNames[Math.floor(Math.random() * setNames.length)];
    }

    /**
     * Get a random image from a specific set
     */
    private getRandomImageFromSet(setName: string): string | null {
        if (!this.config) return null;
        const set = this.config.sets[setName];
        if (!set || set.images.length === 0) return null;
        const image = set.images[Math.floor(Math.random() * set.images.length)];
        return image.name;
    }

    /**
     * Find an image by name across visible sets (respects filter settings)
     */
    private findImage(name: string): { setName: string; image: GallerySet['images'][0]; } | null {
        if (!this.config) return null;

        const includeRotations = COSMETIC.celebrations;
        const setsForMsg = this.getSetsForMessage(includeRotations);

        // Search only in visible sets
        for (const [setName, setData] of Object.entries(setsForMsg)) {
            const image = setData.images.find(img =>
                img.name.toLowerCase().includes(name.toLowerCase()),
            );
            if (image) {
                // Find the original image data from config to get filePath
                const originalSet = this.config.sets[setName];
                const originalImage = originalSet?.images.find(img => img.name === image.name);
                if (originalImage) {
                    return { setName, image: originalImage };
                }
            }
        }

        return null;
    }

    /**
     * Show a specific image
     */
    private async showImage(setName: string, imageName: string): Promise<void> {
        if (!this.config) return;

        const set = this.config.sets[setName];
        if (!set) return;

        const image = set.images.find(img => img.name === imageName);
        if (!image) return;

        // Check if this set is filtered out
        const includeRotations = COSMETIC.celebrations;
        const setsForMsg = this.getSetsForMessage(includeRotations);

        // If the set is filtered out, don't show the image
        if (!setsForMsg[setName]) return;

        this.currentSet = setName;
        this.currentImageName = imageName;

        const imageData: ImageData = {
            name: image.name,
            path: this.getWebviewUri(setName, image.filePath).toString(),
            credits: image.attributions,
            set: {
                name: setName,
                description: set.description,
            },
        };

        this.postMessage({
            type: 'newImage',
            image: imageData,
            sets: setsForMsg,
        });
    }

    /**
     * Show a random image from any set
     */
    private async showRandomImage(): Promise<void> {
        const setName = this.getRandomSetName();
        if (!setName) return;

        const imageName = this.getRandomImageFromSet(setName);
        if (!imageName) return;

        await this.showImage(setName, imageName);
    }

    /**
     * Navigate to next/previous image in current set
     */
    private async navigateImage(direction: 'next' | 'previous', currentImageName?: string): Promise<void> {
        if (!this.config || !this.currentSet) return;

        // Use provided currentImageName or fall back to stored state
        const imageNameToFind = currentImageName || this.currentImageName;
        if (!imageNameToFind) return;

        const includeRotations = COSMETIC.celebrations;
        const setsForMsg = this.getSetsForMessage(includeRotations);

        // Check if current set is still available after filtering
        const setImages = setsForMsg[this.currentSet]?.images;
        if (!setImages || setImages.length === 0) return;

        const currentIndex = setImages.findIndex(img => img.name === imageNameToFind);
        if (currentIndex === -1) return;

        const newIndex = direction === 'next'
            ? (currentIndex + 1) % setImages.length
            : (currentIndex - 1 + setImages.length) % setImages.length;

        const nextImage = setImages[newIndex];
        this.currentImageName = nextImage.name;

        // Send the update with the new image
        this.postMessage({
            type: 'newImage',
            image: {
                name: nextImage.name,
                path: nextImage.path,
                credits: nextImage.credits,
                set: {
                    name: this.currentSet,
                    description: setsForMsg[this.currentSet].description,
                },
            },
            sets: setsForMsg,
        });
    }

    protected handleMessage(message: ImagesViewMessage): void {
        switch (message.type) {
            case 'randomImage':
                void this.showRandomImage();
                break;

            case 'randomSet': {
                const setName = this.getRandomSetName();
                if (setName) {
                    const imageName = this.getRandomImageFromSet(setName);
                    if (imageName) {
                        void this.showImage(setName, imageName);
                    }
                }
                break;
            }

            case 'randomImageInSet':
                if (this.currentSet) {
                    const imageName = this.getRandomImageFromSet(this.currentSet);
                    if (imageName) {
                        void this.showImage(this.currentSet, imageName);
                    }
                }
                break;

            case 'searchImage': {
                const found = this.findImage(message.name);
                if (found) {
                    void this.showImage(found.setName, found.image.name);
                }
                break;
            }

            case 'switchSet':
                if (this.config && this.config.sets[message.name]) {
                    const imageName = this.getRandomImageFromSet(message.name);
                    if (imageName) {
                        void this.showImage(message.name, imageName);
                    }
                }
                break;

            case 'switchImage':
                if (this.currentSet) {
                    void this.showImage(this.currentSet, message.name);
                }
                break;

            case 'nextImage':
                void this.navigateImage('next', message.current);
                break;

            case 'previousImage':
                void this.navigateImage('previous', message.current);
                break;

            case 'searchSet':
                // Send available set names
                if (this.config) {
                    this.postMessage({
                        type: 'setList',
                        sets: Object.keys(this.config.sets),
                    });
                }
                break;

            case 'updateSets':
                // Webview is requesting an update with current config
                void this.sendUpdateToView();
                break;

            case 'viewReady':
                void this.onViewReady();
                break;
        }
    }
}

import type { ImagesViewProviderMessage, ImagesViewMessage, ImageData, ImageSet } from '@/views/image';

interface State {
    currentImage: ImageData | null;
    sets: Record<string, ImageSet>;
}

(function () {
    // Acquire the vscode API provided to webviews
    const vscode = acquireVsCodeApi<State>();
    const state = vscode.getState() || {
        currentImage: null,
        sets: {},
    } satisfies State;

    let currentName: string | null = null;
    let availableNames: string[] = [];

    const mainImage = document.getElementById('mainImage') as HTMLImageElement;
    const imageTitle = document.getElementById('imageTitle') as HTMLHeadingElement;
    const imageCredits = document.getElementById('imageCredits') as HTMLParagraphElement;
    const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    const randomBtn = document.getElementById('randomBtn') as HTMLButtonElement;
    const searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
    const searchBox = document.getElementById('searchBox') as HTMLInputElement;
    const setSelect = document.getElementById('setSelect') as HTMLSelectElement;

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data as ImagesViewProviderMessage;
        switch (message.type) {
            case 'newImage':
                // Overwrite state with authoritative data from provider
                state.currentImage = message.image;
                state.sets = message.sets;
                vscode.setState(state);

                // Update dropdown with new sets
                populateSets(Object.keys(message.sets));

                updateImage();
                break;
            case 'searchResult':
                updateSearchResults(message.names);
                break;
            case 'setList':
                populateSets(message.sets);
                // Check if current image is still valid in the new sets
                if (state.currentImage) {
                    const setName = state.currentImage.set?.name;
                    const imageStillExists = setName && message.sets.includes(setName);
                    if (!imageStillExists) {
                        // Current image's set was removed, request a new random image
                        vscode.postMessage({ type: 'randomImage' } satisfies ImagesViewMessage);
                    }
                } else if (message.sets.length === 0) {
                    // No sets available, clear the image display
                    clearImageDisplay();
                }
                break;
            default:
                // ignore unknown
                break;
        }
    });

    function updateImage() {
        if (!state.currentImage)
            return;

        currentName = state.currentImage.name;

        // Extract available image names from current set
        const setName = state.currentImage.set?.name;
        availableNames = setName && state.sets[setName]
            ? state.sets[setName].images.map(img => img.name)
            : [];

        // path should be a webview-safe uri provided by extension (string)
        mainImage.src = state.currentImage.path || '';
        mainImage.alt = state.currentImage.name;
        imageTitle.textContent = state.currentImage.name;
        imageCredits.textContent = state.currentImage.credits || '';

        // Update selected set to match current image
        setSelect.value = state.currentImage.set.name;
    }

    function clearImageDisplay() {
        currentName = null;
        availableNames = [];
        mainImage.src = '';
        mainImage.alt = 'No image selected';
        imageTitle.textContent = 'No image selected';
        imageCredits.textContent = '';
    }

    function updateSearchResults(names: string[]) {
        // if results not empty, show first
        if (names.length > 0) {
            vscode.postMessage({ type: 'searchImage', name: names[0] } satisfies ImagesViewMessage);
        }
    }

    function populateSets(sets: string[]) {
        // keep selection if already present
        const previous = setSelect.value;
        setSelect.innerHTML = '';
        sets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            setSelect.appendChild(opt);
        });
        if (previous && Array.from(setSelect.options).some(o => o.value === previous)) {
            setSelect.value = previous;
        }
    }

    // control handlers
    prevBtn.addEventListener('click', () => {
        if (availableNames.length === 0) {
            return;
        }
        vscode.postMessage({ type: 'previousImage', current: currentName ?? '' } satisfies ImagesViewMessage);
    });

    nextBtn.addEventListener('click', () => {
        if (availableNames.length === 0) {
            return;
        }
        vscode.postMessage({ type: 'nextImage', current: currentName ?? '' } satisfies ImagesViewMessage);
    });

    randomBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'randomImage' } satisfies ImagesViewMessage);
    });

    searchBtn.addEventListener('click', () => {
        const q = searchBox.value.trim();
        if (q) {
            vscode.postMessage({ type: 'searchImage', name: q } satisfies ImagesViewMessage);
        }
    });

    searchBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const q = searchBox.value.trim();
            if (q) {
                vscode.postMessage({ type: 'searchImage', name: q } satisfies ImagesViewMessage);
            }
        }
    });

    setSelect.addEventListener('change', () => {
        const name = setSelect.value;
        if (name) {
            vscode.postMessage({ type: 'switchSet', name } satisfies ImagesViewMessage);
        }
    });

    // Restore state if available, then request authoritative update
    if (state.currentImage) {
        updateImage();
    }

    // Request update from provider (will send filtered sets based on config)
    vscode.postMessage({ type: 'updateSets' } satisfies ImagesViewMessage);
}());

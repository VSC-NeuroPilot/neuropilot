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
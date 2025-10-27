export interface PatienceDiff {
    lines: DiffLine[];
    lineCountDeleted: number;
    lineCountInserted: number;
    lineCountMoved: 0;
    aMove?: string[];
    aMoveIndex?: number[];
    bMove?: string[];
    bMoveIndex?: number[];
}

export interface DiffLine {
    line: string;
    aIndex: number;
    bIndex: number;
    moved?: boolean;
}

export interface IndexCount {
    count: number;
    index: number;
}

export interface LinkedIndexPair {
    indexA: number;
    indexB: number;
    prev?: LinkedIndexPair;
}

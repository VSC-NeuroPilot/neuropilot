export function saveToTempDir(name: string, file: Buffer): { dir: string, clear(): boolean } {
    return {
        dir: '',
        clear: () => true,
    };
}

import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        utils: 'src/utils/index.ts',
    },
    deps: {
        neverBundle: ['vscode'],
    },
    outputOptions: {
        dir: 'dist',
    },
    publint: true,
    attw: true,
    exports: true,
    tsconfig: './tsconfig.json',
});

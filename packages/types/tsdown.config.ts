import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    outputOptions: {
        dir: 'dist',
    },
    attw: true,
    exports: true,
    tsconfig: './tsconfig.json',
});

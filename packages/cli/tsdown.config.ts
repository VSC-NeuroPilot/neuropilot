import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    outputOptions: {
        file: './bin/index.js',
    },
});

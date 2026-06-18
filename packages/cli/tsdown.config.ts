import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    outputOptions: {
        dir: './bin',
        minify: true,
    },
});

import { defineConfig } from 'rolldown';
import { globSync } from 'tinyglobby';
import * as path from 'path';

const NODE_ENV = (process.env.NODE_ENV ?? 'production').toLowerCase();

if (!['production', 'development'].includes(NODE_ENV)) {
    throw new Error('Invalid NODE_ENV.');
}

export default defineConfig({
    input: Object.fromEntries(
        globSync('webview/**/*.tsx').map((file) => [
            // This removes `webview/` as well as the file extension from each
            // file, so e.g. webview/nested/foo.js becomes nested/foo, and
            // normalizes Windows backslashes to forward slashes.
            path
                .relative('webview', file.slice(0, file.length - path.extname(file).length))
                .split(path.sep)
                .join('/'),
            // This expands the relative paths to absolute paths, so e.g.
            // webview/nested/foo.js becomes /project/src/nested/foo.js
            path.resolve(file),
        ]),
    ),
    output: {
        minify: !!(process.env.NODE_ENV === 'production'),
        dir: 'out/webview',
        sourcemap: !(process.env.NODE_ENV === 'production'),
    },
    tsconfig: true,
});

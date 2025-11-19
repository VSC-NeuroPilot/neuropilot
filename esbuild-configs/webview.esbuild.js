// @ts-check
import { context } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { esbuildProblemMatcherPlugin } from './plugins.js';

/**
 * @param {boolean} prodFlag
 * @param {boolean} watchFlag
 */
export async function webview(prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['webview/**/*.ts'],
        bundle: true,
        format: 'cjs',
        minify: prodFlag,
        sourcemap: !prodFlag,
        sourcesContent: false,
        platform: 'browser',
        outdir: 'out/webview/',
        outbase: 'webview/',
        external: ['vscode'],
        logLevel: 'warning',
        tsconfig: './tsconfig.webview.json',
        treeShaking: true,
        plugins: [
            polyfillNode({
                polyfills: { // trying to make the build as small as possible
                    child_process: false,
                    module: false,
                    os: false,
                    path: false,
                    punycode: false,
                    stream: false,
                    sys: false,
                    v8: false,
                    vm: false,
                    zlib: false,
                },
                globals: {
                    __dirname: false,
                    __filename: false,
                    buffer: false,
                    global: false,
                    navigator: false,
                    process: false,
                },
            }),
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
        ],
    });
    if (watchFlag) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

// @ts-check
import { context } from 'esbuild';

export async function desktop(prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/desktop/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: prodFlag,
        sourcemap: !prodFlag,
        sourcesContent: false,
        platform: 'node',
        outfile: 'out/desktop/extension.js',
        external: ['vscode'],
        logLevel: 'warning',
        tsconfig: './tsconfig.app.json',
        plugins: [
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

export async function desktopTest(_prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/test/suite/desktop/index.ts'],
        bundle: true,
        format: 'cjs',
        minify: false, // Don't minify tests for better debugging
        sourcemap: true, // Always generate sourcemaps for tests
        sourcesContent: true, // Include source content for better debugging
        platform: 'node',
        outfile: 'out/desktop/test.js',
        tsconfig: './test-tsconfigs/tsconfig.app.json',
        external: [
            'vscode',
            'mocha',
            '@vscode/test-electron',
        ],
        logLevel: 'warning',
        define: {
            // Define test environment variables
            'process.env.NODE_ENV': '"test"',
        },
        plugins: [
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

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location == null) return;
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

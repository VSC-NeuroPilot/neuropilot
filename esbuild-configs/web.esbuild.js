// @ts-check
import { context } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';

export async function web(prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/web/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: prodFlag,
        sourcemap: !prodFlag,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'out/web/extension.js',
        external: ['vscode'],
        logLevel: 'warning',
        tsconfig: './tsconfig.web.json',
        plugins: [
            polyfillNode({ polyfills: { // trying to make the build as small as possible
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
            }}),
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

export async function webTest(_prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/test/suite/web/index.ts'],
        bundle: true,
        format: 'cjs',
        minify: false, // Don't minify tests for better debugging
        sourcemap: true, // Always generate sourcemaps for tests
        sourcesContent: true, // Include source content for better debugging        
        platform: 'browser',
        outfile: 'out/web/test/index.js',
        tsconfig: './test-tsconfigs/tsconfig.web.json',
        banner: {
            js: 'if (typeof navigator === "undefined") { var navigator = { language: "en-US" }; } else if (!navigator.language) { navigator.language = "en-US"; }',
        },
        external: [
            'vscode',
            'mocha',
            '@vscode/test-web',
        ],
        logLevel: 'warning',
        define: {
            // Define test environment variables
            'process.env.NODE_ENV': '"test"',
        },
        // Include the same browser polyfills as the web bundle
        plugins: [
            polyfillNode({ polyfills: {
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
            }}),
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

export async function webTestBrowser(_prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/test/suite/web/index.browser.ts'],
        bundle: true,
        format: 'cjs',
        minify: false,
        sourcemap: true,
        sourcesContent: true,
        platform: 'browser',
        outfile: 'out/web/test/browser.js',
        tsconfig: './test-tsconfigs/tsconfig.web.json',
        banner: {
            js: 'if (typeof navigator === "undefined") { var navigator = { language: "en-US" }; } else if (!navigator.language) { navigator.language = "en-US"; }',
        },
        external: [
            'vscode',
            '@vscode/test-web',
        ],
        logLevel: 'warning',
        define: {
            'process.env.NODE_ENV': '"test"',
        },
        plugins: [
            polyfillNode({ polyfills: {
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
            }}),
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

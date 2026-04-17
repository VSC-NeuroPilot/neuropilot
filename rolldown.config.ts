import { defineConfig, RolldownOptions } from 'rolldown';
import { globSync } from 'tinyglobby';
import path from 'node:path';

export default defineConfig((c) => {
    const configArray: RolldownOptions[] = [];
    if (c.desktop) {
        configArray.push(
            configWrapper('src/in/extension.desktop.ts', 'out/desktop/extension.js', './tsconfig.app.json'),
        );
        if (c.test) {
            configArray.push(
                configWrapper('src/test/suite/desktop/index.ts', 'out/desktop/test.js', './test-tsconfigs/tsconfig.app.json', ['mocha', '@vscode/test']),
            );
        }
    };
    if (c.web) {
        configArray.push(configWrapper('src/in/extension.web.ts', 'out/web/extension.js', './tsconfig.web.json'));
        if (c.test) {
            configArray.push(
                configWrapper('src/test/suite/web/index.ts', 'out/web/test/index.js', './test-tsconfigs/tsconfig.web.json', ['mocha', '@vscode/test-web']),
                configWrapper('src/test/suite/web/index.browser.ts', 'out/web/test/browser.js', './test-tsconfigs/tsconfig.web.json', ['mocha', '@vcode/test-web']),
            );
        }
    };
    if (!c.desktop && !c.web) throw new Error('You must pass at least one of --desktop or --web.');
    if (!c.test) configArray.push(
        configWrapper(
            Object.fromEntries(
                globSync('views/**/*.tsx').map((file) => [
                    path
                        .relative('views', file.slice(0, file.length - path.extname(file).length))
                        .split(path.sep)
                        .join('/'),
                    path.resolve(file),
                ]),
            ),
            'out/views',
        ),
    );
    return configArray;

    function configWrapper(input: string | Record<string, string>, output: string, tsconfig?: string, extraExternals: string[] = []): RolldownOptions {
        const external = ['vscode'];
        external.push(...extraExternals);
        return {
            input,
            output: {
                format: 'cjs',
                file: output,
                codeSplitting: false,
                sourcemap: !c.prod,
                minify: c.prod,
            },
            tsconfig,
            external,
            platform: c.desktop ? 'node' : 'browser',
        };
    };
});

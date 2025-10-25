// @ts-check
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    tests: [
        {
            label: 'desktopUnitTest',
            platform: 'desktop',
            files: 'out/desktop/test.js',
            workspaceFolder: './test-playground',
            mocha: {
                timeout: 5000
            },
            env: {
                NEUROPILOT_TEST: 'true',
            },
        },
        { // i hate how underdeveloped the web test side of testing is
            label: 'webUnitTest',
            files: 'out/web/test/index.js',
            workspaceFolder: './test-playground',
            mocha: {
                timeout: 5000
            },
            env: {
                NEUROPILOT_TEST: 'true',
            },
        },
        {
            label: 'browserUnitTest',
            files: 'out/web/test/browser.js',
            workspaceFolder: './test-playground',
            mocha: {
                timeout: 5000
            },
            env: {
                NEUROPILOT_TEST: 'true',
            },
        },
    ],
    coverage: { // only as a backup, should be overridden by CLI options (thank you microsoft, why can't this be simpler)
        reporter: ['html', 'json'],
        include: ['src/**/*.ts'],
        exclude: ['src/test/**/*.ts'],
        output: './coverage',
    }
});

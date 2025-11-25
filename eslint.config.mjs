/**
 * ESLint configuration for the project.
 * 
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

export default tseslint.config(
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        ignores: [
            'out/**',
            'playground/**',
            '**/vscode*.d.ts',
            'esbuild.{m,c,}js',
            'src/types/**/*.d.ts',
            'project-files/**/*',
            'coverage-desktop/**',
            'coverage-web/**',
            '**/dist/**',
        ],
    },
    globalIgnores([
        'out/**',
        '**/dist/**',
        'playground/**',
        '**/vscode*.d.ts',
        '**/.venv/**',
        '**/venv/**',
        '**/.vscode-test/**',
        '**/.vscode-test-web/**',
        'src/types/**/*.d.ts',
        'project-files/**/*',
        '.vscode-test.mjs',
        'check-malicious-packages.js',
        'coverage-desktop/**',
        'coverage-web/**',
        'scripts/check-malicious-packages.js', // TODO: Maybe fix the file later
        'media/**',
    ]),
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        files: [
            '**/*.{ts,mts,cts,tsx}', // Only apply TypeScript rules to TypeScript files
            'webview/**/*.js', // and webview JS files
        ],
        plugins: {
            '@stylistic': stylistic,
            'unicorn': eslintPluginUnicorn,
        },
        rules: {
            'curly': 'off',
            'no-control-regex': 'off',
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/indent': ['warn', 4, {
                'flatTernaryExpressions': true,
                'SwitchCase': 1,
            }],
            '@stylistic/comma-dangle': ['warn', 'always-multiline'],
            '@stylistic/eol-last': ['warn', 'always'],
            '@stylistic/no-extra-parens': ['warn', 'all'],
            '@stylistic/no-trailing-spaces': ['warn', { 'ignoreComments': true }],
            '@stylistic/quotes': ['error', 'single', { 'avoidEscape': true }],
            '@typescript-eslint/no-empty-function': 'off',
            'prefer-const': 'warn',
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    'selector': 'import',
                    'format': ['camelCase', 'PascalCase'],
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    'argsIgnorePattern': '^_',
                },
            ],
            'unicorn/catch-error-name': [
                'error',
                {
                    'name': 'erm',
                },
            ],
        },
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
                projectService: true,
            },
        },
    },
    {
        files: ['src/test/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
    {
        files: ['src/test/suite/desktop/**/*.ts', 'src/test/test_utils.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
    },
    {
        files: ['src/test/suite/web/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.mocha,
            },
        },
    },
    {
        files: ['**/*.{js,mjs,cjs}', 'eslint.config.mjs', 'esbuild.mjs', '**/*.esbuild.{m,c,}js'],
        plugins: {
            '@stylistic': stylistic,
            'unicorn': eslintPluginUnicorn,
        },
        rules: {
            'curly': 'off',
            'no-control-regex': 'off',
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/indent': ['warn', 4, {
                'flatTernaryExpressions': true,
                'SwitchCase': 1,
            }],
            '@stylistic/comma-dangle': ['warn', 'always-multiline'],
            '@stylistic/eol-last': ['warn', 'always'],
            '@stylistic/no-extra-parens': ['warn', 'all'],
            '@stylistic/no-trailing-spaces': ['warn', { 'ignoreComments': true }],
            '@stylistic/quotes': ['error', 'single', { 'avoidEscape': true }],
            'prefer-const': 'warn',
            'unicorn/catch-error-name': [
                'error',
                {
                    'name': 'erm',
                },
            ],
        },
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
            },
            // Do not provide a TypeScript project for JS files to avoid parser errors
        },
    },
);

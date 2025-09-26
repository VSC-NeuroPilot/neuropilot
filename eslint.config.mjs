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
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
        ignores: [
            'out/**',
            'playground/**',
            '**/vscode*.d.ts',
            'esbuild.{m,c,}js',
            'src/types/**/*.d.ts',
            'project-files/**/*',
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
    ]),
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        files: ['**/*.{ts,mts,cts}'], // Only apply TypeScript rules to TypeScript files
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
                project: './tsconfig.json',
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
            parserOptions: {
                project: null, // Disable TypeScript project for JS files
            },
        },
    },
);

import { defineCommand } from 'citty';

export const testCommand = defineCommand({
    meta: {
        name: 'test',
        description: 'Install and open the integration test extension in VS Code',
        alias: ['integration-test'],
    },
    args: {
        version: {
            type: 'positional',
            description: 'The integration test extension to download.',
            required: true,
        },
        type: {
            type: 'enum',
            description: 'The test type.',
            required: true,
            options: ['base', 'companions'],
        },
        github: {
            type: 'boolean',
            description: 'Download from GitHub instead of VS Marketplace.',
            default: false,
        },
        vscode: {
            type: 'enum',
            description: 'The build to install into using its CLI.',
            options: ['stable', 'insiders'],
        },
    },
    async run(ctx) {},
});

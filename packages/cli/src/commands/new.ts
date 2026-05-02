import { defineCommand } from 'citty';

export const newCommand = defineCommand({
    meta: {
        name: 'new',
        description: 'Create a new companion using the official template',
        alias: ['scaffold'],
    },
    args: {
        directory: {
            type: 'positional',
            description: 'The directory to download the template into. Defaults to the current working directory.',
            default: process.cwd(),
        },
        git: {
            type: 'boolean',
            description: 'Whether to intialize a git repository in the folder.',
            default: false,
        },
        install: {
            type: 'enum',
            description: 'The package manager that is called to install dependencies. If omitted, does not install dependencies',
            options: ['npm', 'yarn', 'pnpm'],
            valueHint: 'npm',
        },
    },
    async run(ctx) {
        if (!ctx.args.directory) console.warn(`No directory provided, defaulitng to ${process.cwd()}`);
        const client = new (await import('@octokit/rest')).Octokit();
        const response = await client.repos.downloadZipballArchive({
            owner: 'VSC-NeuroPilot',
            repo: 'neuropilot-companion-template',
            ref: 'master',
        });
    },
});

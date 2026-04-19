import { defineCommand } from 'citty';

export const download = defineCommand({
    meta: { name: 'download', description: 'Download a release from GitHub Releases', alias: ['dl', 'down'] },
    args: {
        version: {
            type: 'positional',
            description: 'The version to download. Must be SemVer-extended-compliant.',
            required: true,
            valueHint: '3.0.0-pre.1',
        },
        install: {
            type: 'enum',
            description: 'Whether or not to install immediately after downloading. Fails immediately in non-TTY environments, as TTY is needed to confirm installation.',
            options: ['stable', 'insiders'],
            alias: ['i', 'in'],
            valueHint: 'stable',
        },
        hash: {
            type: 'boolean',
            description: 'Whether or not to show the SHA-256 hash of the downloaded file after the download.',
            default: true,
        },
    },
    async run(ctx) {
        const { Octokit } = await import('@octokit/rest');
    },
});

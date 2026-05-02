import { defineCommand } from 'citty';

export const downloadCommand = defineCommand({
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
        profile: {
            type: 'string',
            description: 'The profile to install the extension to. Does nothing if install flag is not passed. Defaults to the profile VS Code determines was last used.',
            alias: ['p'],
            valueHint: 'Default',
        },
        hash: {
            type: 'boolean',
            description: 'Whether or not to show the SHA-256 hash of the downloaded file after the download.',
            default: true,
        },
    },
    async run(ctx) {
        if ((ctx.args.profile || ctx.args.p) && !(ctx.args.install || ctx.args.i || ctx.args.in)) {
            throw new Error('Profile option specified, but install option not passed.');
        };
        const client = new (await import('@octokit/rest')).Octokit;
        const release = await client.repos.getReleaseByTag({
            owner: 'VSC-NeuroPilot',
            repo: 'neuropilot',
            tag: `ext-v${ctx.args.version}`,
        });
        if (release.status !== 200) {
            throw new Error(`Error ${release.status} while calling the GitHub Releases API. (url: ${release.url})`);
        }
    },
});

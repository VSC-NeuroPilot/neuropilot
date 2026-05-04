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
        dir: {
            type: 'string',
            description: 'The directory to save the file into.',
            default: process.cwd(),
        },
        install: {
            type: 'enum',
            description: 'Whether or not to install immediately after downloading, and to which build. Fails immediately in non-TTY environments, as TTY is needed to confirm installation.',
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
        }

        const fs = await import('fs');
        const path = await import('path');
        const crypto = await import('crypto');

        const client = new (await import('@octokit/rest')).Octokit();

        console.log(`Fetching release ext-v${ctx.args.version}...`);
        const release = await client.repos.getReleaseByTag({
            owner: 'VSC-NeuroPilot',
            repo: 'neuropilot',
            tag: `ext-v${ctx.args.version}`,
        });

        if (release.status !== 200) {
            throw new Error(`Error ${release.status} while calling the GitHub Releases API. (url: ${release.url})`);
        }

        // Find the .vsix asset
        const vsixAsset = release.data.assets.find(asset => asset.name.endsWith('.vsix'));
        if (!vsixAsset) {
            throw new Error(`No .vsix file found in release ext-v${ctx.args.version}`);
        }

        console.log(`Downloading ${vsixAsset.name} (${(vsixAsset.size / 1024 / 1024).toFixed(2)} MB)...`);

        // Download the asset
        // When using accept: 'application/octet-stream', the response.data is the binary content
        const assetResponse = await client.repos.getReleaseAsset({
            owner: 'VSC-NeuroPilot',
            repo: 'neuropilot',
            asset_id: vsixAsset.id,
            headers: {
                accept: 'application/octet-stream',
            },
        }) as unknown as { data: ArrayBuffer };

        // Ensure directory exists
        const targetDir = ctx.args.dir || process.cwd();
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Save to file
        const filePath = path.join(targetDir, vsixAsset.name);
        const buffer = Buffer.from(new Uint8Array(assetResponse.data));
        fs.writeFileSync(filePath, buffer);

        console.log(`✓ Downloaded to: ${filePath}`);

        // Calculate and show hash if requested
        if (ctx.args.hash) {
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            console.log(`SHA-256: ${hash}`);
        }

        // Install if requested
        if (ctx.args.install || ctx.args.i || ctx.args.in) {
            const build = ctx.args.install || ctx.args.i || ctx.args.in;
            const codeCommand = build === 'insiders' ? 'code-insiders' : 'code';

            // Check if running in TTY
            if (!process.stdin.isTTY) {
                throw new Error('Cannot install in non-TTY environment. Manual installation required.');
            }

            console.log(`\nInstalling to VS Code ${build}...`);

            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            const profile = ctx.args.profile || ctx.args.p;
            const installArgs = ['--install-extension', filePath];
            if (profile) {
                installArgs.push('--profile', profile);
            }

            try {
                const { stdout, stderr } = await execAsync(`${codeCommand} ${installArgs.join(' ')}`);
                if (stdout) console.log(stdout);
                if (stderr) console.error(stderr);
                console.log('✓ Extension installed successfully!');
            } catch (erm) {
                console.error('Failed to install extension:', erm);
                throw erm;
            }
        }
    },
});

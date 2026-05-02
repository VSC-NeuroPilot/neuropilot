import { defineCommand } from 'citty';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import assert from 'assert';
import { exec } from 'child_process';

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
        const targetDir = ctx.args.directory;

        console.log(`Downloading template to ${targetDir}...`);

        // Download the zipball
        const client = new (await import('@octokit/rest')).Octokit();
        const response = await client.repos.downloadZipballArchive({
            owner: 'VSC-NeuroPilot',
            repo: 'neuropilot-companion-template',
            ref: 'master',
        });

        // Create a temporary file
        const tempDir = os.tmpdir();
        const tempZipPath = path.join(tempDir, `neuropilot-template-${Date.now()}.zip`);

        // Write the zip data to the temp file
        // The response.data is a Buffer or ArrayBuffer
        fs.writeFileSync(tempZipPath, Buffer.from(response.data as ArrayBuffer));

        // Extract the zip file
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(tempZipPath);
        const tempExtractDir = path.join(tempDir, `neuropilot-template-extract-${Date.now()}`);
        zip.extractAllTo(tempExtractDir, true);

        // GitHub wraps the content in a folder named like "repo-ref"
        // Find that folder and copy its contents to the target directory
        const extractedContents = fs.readdirSync(tempExtractDir);
        assert(extractedContents.length !== 0, 'Extracted archive is empty');
        const wrappedFolder = extractedContents[0]!; // Should be the only item
        const sourceDir = path.join(tempExtractDir, wrappedFolder);

        // Create target directory if it doesn't exist
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy contents from source to target
        const copyRecursive = (src: string, dest: string) => {
            const items = fs.readdirSync(src);
            for (const item of items) {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);

                if (fs.statSync(srcPath).isDirectory()) {
                    fs.mkdirSync(destPath, { recursive: true });
                    copyRecursive(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        };

        copyRecursive(sourceDir, targetDir);

        // Clean up temporary files
        fs.rmSync(tempZipPath);
        fs.rmSync(tempExtractDir, { recursive: true });

        console.log('Template downloaded successfully!');

        // Handle git init and npm install based on args...
    },
});

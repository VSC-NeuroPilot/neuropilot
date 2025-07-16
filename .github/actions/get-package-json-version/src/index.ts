import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

async function run(): Promise<void> {
    try {
        // Get the input path
        const inputPath = core.getInput('path') || '.';

        // Resolve the package.json file path
        const packageJsonPath = path.resolve(inputPath, 'package.json');

        // Check if package.json exists
        if (!fs.existsSync(packageJsonPath)) {
            core.setFailed(`package.json not found at path: ${packageJsonPath}`);
            return;
        }

        // Read and parse package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        // Get the version key
        const version = packageJson.version;
        if (!version) {
            core.setFailed('Version key not found in package.json');
            return;
        }

        // Set the version as output and environment variable
        core.setOutput('version', version);
        core.exportVariable('PACKAGE_VERSION', version);

        core.info(`Version set to: ${version}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (erm: any) {
        core.setFailed(erm as string);
    }
}

run();

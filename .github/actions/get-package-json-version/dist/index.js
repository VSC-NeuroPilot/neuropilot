"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
async function run() {
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
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();

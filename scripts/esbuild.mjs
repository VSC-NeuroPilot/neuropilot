import { web, webTest, webTestBrowser } from '../esbuild-configs/web.esbuild.js';
import { desktop, desktopTest } from '../esbuild-configs/desktop.esbuild.js';
import * as fs from 'fs';
import chalk from 'chalk';
import console from 'node:console';
import process from 'node:process';
import { webview } from '../esbuild-configs/webview.esbuild.js';

// Checks production mode
function determineProductionMode() {
    const prodFlag = process.argv.includes('--production') || process.argv.includes('--prod');
    const devFlag = process.argv.includes('--development') || process.argv.includes('--dev');

    if (prodFlag && devFlag) {
        console.error(chalk.red.bold("❌ Can't build for both prod and dev at the same time."));
        process.exit(1); // Exit since this is an invalid state
    }

    // Check for explicit command line flags first
    if (prodFlag) {
        return true;
    }
    if (devFlag) {
        return false;
    }

    // Check environment variable
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv) {
        // Check for 0/1 values first
        if (nodeEnv === '1') {
            return true;
        }
        if (nodeEnv === '0') {
            return false;
        }
        // Fallback to string comparison for backward compatibility
        if (nodeEnv.toLowerCase() === 'production') {
            return true;
        }
    }

    // Default to development
    return false;
}

const production = determineProductionMode();
const watch = process.argv.includes('--watch');
const modeArgIndex = process.argv.indexOf('--mode');
const test = process.argv.includes('--test');
const mode = modeArgIndex !== -1 && process.argv[modeArgIndex + 1] ? process.argv[modeArgIndex + 1] : 'default';
const webBrowserTest = process.argv.includes('--web-browser-test');

// Log the build configuration
console.log(chalk.bold(`🏗️  Build mode: ${production ? chalk.green('🏭 Production') : chalk.yellow('🛠️ Development')}`));
if (process.env.NODE_ENV) {
    console.log(chalk.cyan(`🌍 NODE_ENV: ${process.env.NODE_ENV}`));
}

let outDir;
if (test) {
    switch (mode.toLowerCase()) {
        case 'web':
            outDir = webBrowserTest ? ['./out/web/test/browser.js'] : ['./out/web/test/index.js'];
            break;
        case 'desktop':
            outDir = ['./out/desktop/test.js'];
            break;
        default:
            outDir = ['./out/desktop/test.js', './out/web/test/index.js'];
            break;
    }
} else {
    switch (mode.toLowerCase()) {
        case 'web':
            outDir = ['./out/web/extension.js'];
            break;
        case 'desktop':
            outDir = ['./out/desktop/extension.js'];
            break;
        case 'webview':
            outDir = ['./out/webview/'];
            break;
        default:
            outDir = ['./out/desktop/extension.js', './out/web/extension.js', './out/webview/'];
    }
}

for (const dir of outDir) {
    if (fs.existsSync(dir)) {
        console.log(chalk.yellow(`🗑️  Output directory ${dir} already exists, removing dir...`));
        fs.rmSync(dir, {recursive: true});
    } else {
        console.log(chalk.dim(`📁  Output directory ${dir} doesn't exist, skipping removal step.`));
    }
}

try {
    switch (mode.toLowerCase()) {
        case 'web':
            if (test) {
                console.log(chalk.blue(`🌐 ${watch ? 'Watching' : 'Running'} web test build...`));
                const runner = webBrowserTest ? webTestBrowser : webTest;
                await runner(production, watch).catch(erm => {
                    console.error(chalk.red.bold(`💥  Web test build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🧪  Web tests compiled successfully!'));
            } else {
                console.log(chalk.blue(`🌐 ${watch ? 'Watching' : 'Running'} web build...`));
                await web(production, watch).catch(erm => {
                    console.error(chalk.red.bold(`💥  Web build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🧰  Web build completed successfully!'));
            }
            break;
        case 'desktop':
            if (test) {
                console.log(chalk.blue(`🖥️  ${watch ? 'Watching' : 'Running'} desktop test build...`));
                await desktopTest(production, watch).catch(erm => {
                    console.error(chalk.red.bold(`💥 Desktop test build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🧪  Desktop tests compiled successfully!'));
            } else {
                console.log(chalk.blue(`🖥️  ${watch ? 'Watching' : 'Running'} desktop build...`));
                await desktop(production, watch).catch(erm => {
                    console.error(chalk.red.bold(`💥 Desktop build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🧰  Desktop build completed successfully!'));
            }
            break;
        case 'webview':
            console.log(chalk.blue(`🖥️  ${watch ? 'Watching' : 'Running'} webview build...`));
            await webview(production, watch).catch(erm => {
                console.error(chalk.red.bold(`💥 Webview build failed: ${erm}`));
                process.exit(1);
            });
            console.log(chalk.green.bold.underline('🧰  Webview build completed successfully!'));
            break;
        case 'default':
            // Can't use watch while building both.
            if (watch) {
                console.error(chalk.yellow.bold('⚠️  Cannot use flag --watch while building both desktop and web'));
                //process.exit(1); we'll just continue building it normally ig
            }
            if (test) {
                console.log(chalk.blue('🖥️🧪  Running desktop test build...'));
                await desktopTest(production, false).catch(erm => {
                    console.error(chalk.red.bold(`💥  Desktop test build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.blue('🌐🧪 Running web test build...'));
                await webTest(production, false).catch(erm => {
                    console.error(chalk.red.bold(`💥  Web test build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🎉🧪 Tests compiled successfully!'));
            } else {
                console.log(chalk.blue('🖥️  Running desktop build...'));
                await desktop(production, false).catch(erm => {
                    console.error(chalk.red.bold(`💥  Desktop build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.blue('🌐 Running web build...'));
                await web(production, false).catch(erm => {
                    console.error(chalk.red.bold(`💥  Web build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.blue('🌐 Running webview build...'));
                await webview(production, false).catch(erm => {
                    console.error(chalk.red.bold(`💥  Webview build failed: ${erm}`));
                    process.exit(1);
                });
                console.log(chalk.green.bold.underline('🎉 Builds completed successfully!'));
            }
            break;
        default:
            console.error(chalk.red.bold(`❌  Unknown mode: ${mode}`));
            process.exit(1);
    }
} catch (erm) {
    console.error(chalk.bgRed.white.bold(`💥  Build failed: ${erm}`));
    process.exit(1);
}

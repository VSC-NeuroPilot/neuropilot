// Load mocha in browser environment
import 'mocha/mocha';
import * as vscode from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';
import { NEURO } from '@/constants';
// Ensure navigator.language exists in headless web test env
// Keep this shim: the headless harness may lack a proper Navigator object
// during early module evaluation, which breaks utilities that read it eagerly.
if (typeof navigator === 'undefined') {
    globalThis.navigator = { language: 'en-US' } as Navigator;
}

if (globalThis?.process?.env?.NEUROPILOT_TEST === 'true') {
    const originalError = console.error;
    const originalWarn = console.warn;
    const isNoise = (message: string) =>
        message.includes('WebSocket is not open') || message.includes('DisposableStore that has already been disposed');
    console.error = (...args) => {
        const message = args.map(String).join(' ');
        if (isNoise(message)) return;
        originalError(...args);
    };
    console.warn = (...args) => {
        const message = args.map(String).join(' ');
        if (isNoise(message)) return;
        originalWarn(...args);
    };
}

const globalWithTest = globalThis as typeof globalThis & { NEUROPILOT_TEST?: boolean };
globalWithTest.NEUROPILOT_TEST = true;
NeuroClient.prototype.sendContext = () => {};
NeuroClient.prototype.registerActions = () => {};
NeuroClient.prototype.unregisterActions = () => {};
NeuroClient.prototype.sendActionResult = () => {};
NeuroClient.prototype.onAction = () => {};

if (!NEURO.outputChannel) {
    NEURO.outputChannel = vscode.window.createOutputChannel('Neuropilot Test');
}
if (!NEURO.client) {
    NEURO.client = {
        sendContext: () => {},
        disconnect: () => {},
        registerActions: () => {},
        unregisterActions: () => {},
        sendActionResult: () => {},
        onAction: () => {},
    } as unknown as NeuroClient;
}

export function run(): Promise<void> {
    mocha.setup({ ui: 'tdd', color: true });
    mocha.reporter('spec');
    return new Promise((resolve, reject) => {
        (async () => {
            try {
                await import('./extension.test.js');
                await import('../file_actions.test.js');
                await import('../utils.test.js');
                await import('../test_utils.test.js');
                await import('../common/actionMetadataValidation.test.js');
                await import('../../unit-test/rewrite_all.simple.test.js');
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (erm) {
                reject(erm);
            }
        })();
    });
}

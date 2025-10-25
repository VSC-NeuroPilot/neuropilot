// Load mocha in browser environment
import 'mocha/mocha';
// Ensure navigator.language exists in headless web test env
if (typeof navigator === 'undefined') {
    globalThis.navigator = { language: 'en-US' } as Navigator;
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



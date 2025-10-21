import * as assert from 'assert';
import * as vscode from 'vscode';
import { CONFIG, ACCESS, ACTIONS, CONNECTION } from '../../../config';

suite('Web Extension Tests', () => {
    test('Sanity Check', () => {
        assert.strictEqual(9 + 10, 19, '9 + 10 shouldn\'t be 21, it should be 19!');
    });

    test('Extension exists', async () => {
        const extension = vscode.extensions.getExtension('VSC-NeuroPilot.neuropilot-base');
        assert.ok(extension, 'Extension vsc-neuropilot.neuropilot-base should be installed!');
        await extension.activate();
        assert.ok(extension!.isActive, 'Extension should be active!');
    });

    test('Workspace folder is correct', () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be defined!');
        const acceptable = new Set(['test-playground', 'mount']);
        assert.ok(acceptable.has(workspaceFolder.name), `Workspace name should be one of ${Array.from(acceptable).join(', ')}!`);
    });

    test('All package.json settings have corresponding config class entries', () => {
        const extension = vscode.extensions.getExtension('VSC-NeuroPilot.neuropilot-base');
        assert.ok(extension, 'Extension should exist');

        const packageJSON = extension!.packageJSON;
        const configuration = packageJSON.contributes?.configuration?.[0];
        assert.ok(configuration, 'Configuration should exist in package.json');

        const properties = configuration.properties;
        assert.ok(properties, 'Properties should exist in configuration');

        // Get all setting keys from package.json (excluding permission settings)
        const settingKeys = Object.keys(properties).filter(key =>
            key.startsWith('neuropilot.') &&
            !key.startsWith('neuropilot.permission.'),
        );

        // Automatically discover properties from config classes
        const configClasses = {
            CONFIG,
            ACCESS,
            CONNECTION,
            ACTIONS,
        };

        const mappedSettings = new Set<string>();
        const classErrors: string[] = [];

        // Test each config class and collect accessible properties
        for (const [className, classInstance] of Object.entries(configClasses)) {
            try {
                const properties = Object.getOwnPropertyNames(Object.getPrototypeOf(classInstance))
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter(prop => prop !== 'constructor' && typeof (classInstance as any)[prop] !== 'function');

                // Try to access each property to see what settings it corresponds to
                for (const prop of properties) {
                    try {
                        // Access the property to trigger the getter
                        //const value = (classInstance as any)[prop];

                        // Map property names to potential setting names
                        const potentialSettings = [
                            `neuropilot.${prop}`,
                            `neuropilot.${className.toLowerCase()}.${prop}`,
                            // Handle camelCase to kebab-case conversion
                            `neuropilot.${prop.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
                            `neuropilot.${className.toLowerCase()}.${prop.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
                        ];

                        // Check if any of these potential settings exist in package.json
                        for (const setting of potentialSettings) {
                            if ((properties as unknown as Record<string, unknown>)[setting]) {
                                mappedSettings.add(setting);
                            }
                        }

                    } catch {
                        // Some getters might fail, that's ok
                    }
                }
            } catch (erm) {
                classErrors.push(`${className}: ${erm}`);
            }
        }

        // Filter out deprecated settings
        const deprecatedSettings = [
            'neuropilot.websocketUrl',
            'neuropilot.gameName',
            'neuropilot.initialContext',
            'neuropilot.includePattern',
            'neuropilot.excludePattern',
            'neuropilot.allowUnsafePaths',
            'neuropilot.disabledActions',
            'neuropilot.hideCopilotRequests',
            'neuropilot.allowRunningAllTasks',
            'neuropilot.enableCancelEvents',
        ];

        const activeSettings = settingKeys.filter(key => !deprecatedSettings.includes(key));

        // Find unmapped settings
        const unmappedSettings = activeSettings.filter(setting => !mappedSettings.has(setting));

        // Report any class access errors
        if (classErrors.length > 0) {
            console.warn('Config class access errors:', classErrors);
        }

        // Main assertion
        assert.strictEqual(
            unmappedSettings.length,
            0,
            `The following settings from package.json are not accessible through config classes: ${unmappedSettings.join(', ')}\n` +
            `Mapped settings: ${Array.from(mappedSettings).sort().join(', ')}`,
        );

        // Verify config classes are functional
        try {
            // Test that we can access at least some properties from each class
            assert.ok(Object.prototype.hasOwnProperty.call(CONFIG, 'beforeContext') || typeof CONFIG.beforeContext !== 'undefined', 'CONFIG should have accessible properties');
            assert.ok(Object.prototype.hasOwnProperty.call(ACCESS, 'includePattern') || typeof ACCESS.includePattern !== 'undefined', 'ACCESS should have accessible properties');
            assert.ok(Object.prototype.hasOwnProperty.call(CONNECTION, 'websocketUrl') || typeof CONNECTION.websocketUrl !== 'undefined', 'CONNECTION should have accessible properties');
            assert.ok(Object.prototype.hasOwnProperty.call(ACTIONS, 'disabledActions') || typeof ACTIONS.disabledActions !== 'undefined', 'ACTIONS should have accessible properties');
        } catch (erm) {
            assert.fail(`Config class verification failed: ${erm}`);
        }
    });

    // We also need a test to ensure that polyfilled modules (i.e. assert) are successfully bundled.
    test('assert module is polyfilled and works', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const assert = require('assert');
        try {
            assert.strictEqual(1, 2, 'Should throw');
            assert.fail('assert did not throw as expected');
        } catch (erm: unknown) {
            assert.ok(erm instanceof assert.AssertionError, 'Error should be an AssertionError');
        }
    });
});

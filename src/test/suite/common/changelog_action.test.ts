import * as assert from 'assert';
import * as vscode from 'vscode';
import { anything, capture, instance, mock, reset, verify } from 'ts-mockito';
import { NEURO } from '@/constants';
import { readChangelogAndSendToNeuro } from '@/changelog';
import { NeuroClient } from 'neuro-game-sdk';

suite('Integration: read_changelog action', () => {
    let originalClient: NeuroClient | null = null;
    let mockedClient: NeuroClient;
    const memento = new Map<string, unknown>();

    suiteSetup(() => {
        // Mock client and connectivity
        originalClient = NEURO.client;
        mockedClient = mock(NeuroClient);
        NEURO.client = instance(mockedClient);
        NEURO.connected = true;

        // Minimal ExtensionContext for globalState and extensionUri
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        assert.ok(workspaceUri, 'Workspace must be defined for tests');

        NEURO.context = {
            extensionUri: workspaceUri,
            globalState: {
                get: <T>(key: string): T | undefined => memento.get(key) as T | undefined,
                update: async (key: string, value: unknown) => {
                    memento.set(key, value);
                },
            },
        } as unknown as vscode.ExtensionContext;

        // Ensure a test CHANGELOG.md exists in the workspace for parsing
        const changelogContent = [
            '# NeuroPilot changelog',
            '',
            '## 2.3.0',
            '',
            '### Changes',
            '- Placeholder entry for 2.3.0',
            '',
            '## 2.2.3',
            '',
            '### Fixes',
            '- Placeholder entry for 2.2.3',
            '',
            '## 2.2.2',
            '',
            '### Added features',
            '- Placeholder entry for 2.2.2',
            '',
            '## 2.2.1',
            '',
            '### Changes',
            '- Placeholder entry for 2.2.1',
            '',
        ].join('\n');
        const uri = vscode.Uri.joinPath(workspaceUri, 'CHANGELOG.md');
        return vscode.workspace.fs.writeFile(uri, Buffer.from(changelogContent, 'utf8'));
    });

    suiteTeardown(() => {
        NEURO.client = originalClient;
        originalClient = null;
        NEURO.context = null;
    });

    teardown(() => {
        reset(mockedClient);
        memento.clear();
    });

    test('with explicit fromVersion includes that version to latest, oldest→latest', async () => {
        // === Act ===
        await readChangelogAndSendToNeuro('2.2.1');

        // === Assert ===
        await checkSendOnce();
        const [ctx] = capture(mockedClient.sendContext).last();
        assert.ok(typeof ctx === 'string');
        const text = ctx as string;
        assert.ok(text.includes('Changelog entries from 2.2.1 to 2.3.0:'), 'should show correct range');
        const order = [
            '## 2.2.1',
            '## 2.2.2',
            '## 2.2.3',
            '## 2.3.0',
        ];
        let lastIndex = -1;
        for (const marker of order) {
            const idx = text.indexOf(marker);
            assert.ok(idx !== -1, `missing section ${marker}`);
            assert.ok(idx > lastIndex, `section ${marker} is not in correct order`);
            lastIndex = idx;
        }
    });

    test('default with no memento starts at 2.3.0', async () => {
        await readChangelogAndSendToNeuro(undefined);
        await checkSendOnce();
        const [ctx] = capture(mockedClient.sendContext).last();
        const text = String(ctx);
        assert.ok(text.includes('Changelog entries from 2.3.0 to 2.3.0:'), 'default should start at 2.3.0');
    });

    test('default when saved is latest sends latest again', async () => {
        // simulate saved latest
        // @ts-expect-error - accessing test memento helper through NEURO.context
        await NEURO.context.globalState.update('lastDeliveredChangelogVersion', '2.3.0');
        await readChangelogAndSendToNeuro(undefined);
        await checkSendOnce();
        const text = String(capture(mockedClient.sendContext).last()[0]);
        assert.ok(text.includes('Changelog entries from 2.3.0 to 2.3.0:'), 'should send only latest');
    });

    test('default when saved older sends only newer entries', async () => {
        // saved 2.2.2 → should send 2.2.3 and 2.3.0
        // @ts-expect-error - accessing test memento helper through NEURO.context
        await NEURO.context.globalState.update('lastDeliveredChangelogVersion', '2.2.2');
        await readChangelogAndSendToNeuro(undefined);
        await checkSendOnce();
        const text = String(capture(mockedClient.sendContext).last()[0]);
        const contains = (m: string) => text.includes(m);
        assert.ok(contains('Changelog entries from 2.2.3 to 2.3.0:'), 'range should start after saved');
        assert.ok(!contains('## 2.2.2'), 'should not include saved version');
        assert.ok(!contains('## 2.2.1'), 'should not include older than saved');
    });

    async function checkSendOnce(timeoutMs = 5000, intervalMs = 100) {
        const start = Date.now();
        while (true) {
            try {
                verify(mockedClient.sendContext(anything())).once();
                return;
            } catch {
                if (Date.now() - start > timeoutMs) throw new Error('sendContext not called once within timeout');
                await new Promise(r => setTimeout(r, intervalMs));
            }
        }
    }
});



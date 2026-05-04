import { Contributions, PermissionError } from '@vsc-neuropilot/api-types';

import { Companion } from '@/api/companions';
import assert, { AssertionError } from 'assert';
import { changelogs } from '@/changelog';
import { registry } from '@/plugins';
import { assertProperties } from '@test/test_utils';

const testCompanionMetadata = { name: 'NeuroPilot Unit Tests', author: 'VSC-NeuroPilot', extensionId: 'vsc-neuropilot.neuropilot-base', contributes: [Contributions.CHANGELOG] };

suite('Validation decorator suite', () => {
    const companion = new Companion({ ...testCompanionMetadata, name: testCompanionMetadata.name + `-${Math.random()}` });
    test('Can add to changelog', () => {
        companion.addChangelog('under test', 'Currently under test.');
        assert(changelogs[companion['data'].name].find((c) => c.version === 'under test' && c.body === 'Currently under test.'));
    });
    test('Cannot call action functions', () => {
        try {
            companion.addActions([]);
            throw new AssertionError({
                message: 'Was able to add an action despite not being allowed too!',
            });
        } catch (erm) {
            if (!(erm instanceof PermissionError)) throw erm;
        }
    });
    suiteTeardown(() => companion.dispose());
});

suite('Companion setup and teardown', () => {
    test('Added and removed to companion registry', () => {
        const metadata = { ...testCompanionMetadata, name: testCompanionMetadata.name + `-${Math.random()}` };
        const companion = new Companion(metadata);
        assertProperties(registry[companion['token']], metadata, 'Metadata did not match as expected!');
        companion.dispose();
        assert(!Object.values(registry).includes(metadata));
    });
});

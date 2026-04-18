import { Contributions, PermissionError } from '@vsc-neuropilot/api-types';

import { Companion } from '@/api/companions';
import assert, { AssertionError } from 'assert';
import { changelogs } from '@/changelog';
import { registry } from '@/plugins';

const testCompanionMetadata = { name: 'NeuroPilot Unit Tests', author: 'VSC-NeuroPilot', extensionId: 'vsc-neuropilot.neuropilot-base', contributes: [Contributions.CONTEXT] };

suite('Validation decorator suite', () => {
    const companion = new Companion(testCompanionMetadata);
    test('Can add to changelog', () => {
        companion.addChangelog('under test', 'Currently under test.');
        assert(changelogs[companion['token']].find((c) => c.version === 'under test' && c.body === 'Currently under test.'));
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
        const companion = new Companion(testCompanionMetadata);
        assert(registry[companion['token']] === testCompanionMetadata);
        companion.dispose();
        assert(!Object.values(registry).includes(testCompanionMetadata));
    });
});

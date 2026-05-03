import { defineCommand, runMain } from 'citty';

import pkg from '../package.json';

import { downloadCommand } from './commands/download';
import { newCommand } from './commands/new';
import { testCommand } from './commands/test';

const main = defineCommand({
    meta: {
        name: Object.keys(pkg.bin)[0]!,
        version: pkg.version,
        description: pkg.description,
    },
    subCommands: { download: downloadCommand, new: newCommand, test: testCommand },
});

runMain(main);

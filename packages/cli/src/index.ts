import { defineCommand, runMain } from 'citty';

import { downloadCommand } from './commands/download';

import pkg from '../package.json';

const main = defineCommand({
    meta: {
        name: Object.keys(pkg.bin)[0]!,
        version: pkg.version,
        description: pkg.description,
    },
    subCommands: { download: downloadCommand },
});

runMain(main);

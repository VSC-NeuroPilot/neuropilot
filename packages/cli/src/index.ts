import { defineCommand, runMain } from 'citty';

import { download } from './commands/download';

import pkg from '../package.json';

const main = defineCommand({
    meta: {
        name: Object.keys(pkg.bin)[0]!,
        version: pkg.version,
        description: pkg.description,
    },
    subCommands: { download },
});

runMain(main);

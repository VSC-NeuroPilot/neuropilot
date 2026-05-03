import { defineCommand } from 'citty';

export const testCommand = defineCommand({
    meta: {
        name: 'test',
        description: 'Install and open the integration test extension in VS Code.',
        hidden: true,
    },
    args: {
        version: {},
        github: {},
        vscode: {},
    },
    run(ctx) {},
});

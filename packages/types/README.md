# NeuroPilot API types

This package contains the types for the [NeuroPilot VS Code extension](https://github.com/VSC-NeuroPilot/neuropilot).

> [!WARNING]
> The API is currently unstable and may change at any notice!
> Please make sure to stay on top of new releases.

## Usage

Install with:

```sh
npm install -D @vsc-neuropilot/api-types
# or your package manager's equivalent
# Make sure that you also have @types/vscode installed!
```

Then, in your own extension, declare an extension dependency on NeuroPilot:

```json
{
    "extensionDependencies": ["vsc-neuropilot.neuropilot-base"]
}
```

and get the API within your extension:

```ts
import * as vscode from 'vscode';
import { NeuroPilotAPI } from '@vsc-neuropilot/api-types';

let neuropilot: NeuroPilotAPI

export function activate(ctx: vscode.ExtensionContext) {
    neuropilot = vscode.extensions.getExtension<NeuroPilotAPI>('vsc-neuropilot.neuropilot-base')!.exports
}
```

Now, you can register your extension:

```ts
new neuropilot.Companion('your extension name here')
```

## Documentation

If you are wanting to use the API to integrate with Neuro via this extension, please visit [the section dedicated to the API on NeuroPilot's documentation page](https://vsc-neuropilot.github.io/docs/api).
You will be able to find code samples and references there. Common/handy usage patterns may also have a dedicated Guides page now/in the future.

You may also read the inline JSDoc comments for in-editor notes about how the function should be used.

The [changelog](./CHANGELOG.md) file lists the changes between different API versions.
This may be helpful for you to catch up on what specifically may be causing bugs in your code.

If you wish to contribute to the API (whether about type changes or functionality implementation), please read the API-specific [CONTRIBUTING.md file](./CONTRIBUTING.md).
This lays out everything you will need to know for making changes to the API.

If you discover a security issue with the API, please follow the API-specific [SECURITY.md file](./SECURITY.md). <!-- todo: graduate to repo-wide security policy? -->

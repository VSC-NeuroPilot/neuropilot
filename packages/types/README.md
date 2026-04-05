# NeuroPilot API types

This package contains the types for the [NeuroPilot VS Code extension](https://github.com/VSC-NeuroPilot/neuropilot).

## Usage

Install with:

```sh
npm install -D @vsc-neuropilot/api-types
# or your package manager's equivalent
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

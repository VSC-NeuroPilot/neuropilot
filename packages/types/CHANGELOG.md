<!-- markdownlint-disable -->

# API updates

This changelog details the changes between API versions.

## (Draft) 1.0.0

This is the first release of the API. The versioning will be as follows:

- Patch versions (x.x.x) do not contain breaking changes or change warnings. These patch versions contain either non-breaking type changes or JSDoc annotation updates. In other words, you can often upgrade patch versions without much hassle.
- Minor versions (x.x.0) do not contain breaking changes, but may contain change warnings. Change warnings act as early signals that your code may need to be changed in the upcoming major. Additionally, minor versions also add new APIs and may indicate minor functionality changes (without changing the type signature). Minor versions will *generally* maintain backwards compatibility.
- Major versions (x.0.0) contain breaking changes. These breaking changes will most likely force you to change your code to handle the new type signatures and functionality. It is recommended to thoroughly test your code before upgrading to this version. Major versions can break backwards compatibility.

Each higher version type can also inherit characteristics from the lower version types.

For prereleases:

- Pre-release versions (x.x.x-pre.x) are unstable releases for the designated API version. These contain work-in-progress types and annotations. Pre-release versions are not meant to be used except for trying out new API interfaces and giving feedback, and may change without prior programmatic or verbal notice. Pre-release versions are meant to be used with new builds from the `dev` branch of the base extension repo.
- Release candidates (x.x.x-rc.x) are stable previews for the designated API version. These contain types that are more or less finalized for the designated release. Breaking changes should not be expected, both in type signature and functionality, but will always be highlighted in the changelog if necessary. This is also meant for feedback, but only for more subtle feedback before releasing that version such that it simply just contains bug fixes and very minor changes.

## 1.0.0-pre.14

### Breaking changes

- `defineAction` is now imported from `/utils` instead of the main entrypoint.

### Fixed

- Fixed `registerAction` and `unregisterAction` always requiring the `actions:manage_others` contribution point.

## 1.0.0-pre.13

### Fixed

- There was another broken import introduced in pre10 which is fixed now.

## 1.0.0-pre.12

### Fixed

- Last update didn't work properly due to a broken import, should work now

## 1.0.0-pre.11

### Fixed

- `CompanionAPI.addActions` was causing type errors due to being too strict with typing the array input. It now uses the `RCEAction<any, SchemaTypes, any>[]` type for its first input, since we don't need to really type-check on it or anything.
    - There may be a way to tighten the allowed types, but for now this should unblock.

## 1.0.0-pre.10

### Added

- 11 utility functions were added to the package with the new `./utils` partition:
    - `contextPath` - Process a path for usage in context.
    - `contextFileContent` - Process the contents of a text file for usage in context.
    - `substituteMatch` - Get the string that would be inserted for a specified match.
    - `splitIdentifier` - Split an identifier into an array of words.
    - `toTitleCase` - Convert a string to Title Case.
    - `formatActionName` - Turn an arbitrary string into a valid action name.
    - `getWorkspaceUri` - Get the main workspace URI.
    - `normalizePath` - Normalize a path for comparisons.
    - `escapeRegExp` - Escape RegExp control characters.
    - `getMaxFenceLength` - Search for the longest fence (at least 3 backticks in a row) in the given text.
    - `getRequiredFence` - Gets the minimum fence required to enclose the given text.
- 2 interfaces and 1 type were added:
    - `PositionContext`
    - `PositionContextOptions`
    - `CursorPositionContextStyle`
- 2 new functions were added to the API:
    - `getPositionContext` - Get the context around a specified range in a document.
    - `formatContext` - Format the context for sending to Neuro.

### Removed

- 2 file path utils were removed from the API:
    - `simpleFileName` is replaced by `contextPath` in the utils partition (same functionality).
    - `normalizePath` is replaced by `contextPath` in the utils partition (same functionality, corrected documentation).
- Workspace utils were removed from the API:
    - `getWorkspaceUri` is now exported directly by the utils partition.
    - `getWorkspacePath` is unnecessary, the path can be obtained using `getWorkspaceUri`.

## 1.0.0-pre.9

### Added

- 4 new methods were added to the Companion API:
    - `isNeuroConnected` - returns a boolean indicating if Neuro is currently connected
    - `getCurrentActionForce` - returns the details of the current action force, or `null` if there isn't one (`actions:force` contribution point required)
    - `canForceActions` - returns a boolean indicating if forcing an action is possible right now (`actions:force` contribution point required)
    - `abortActionForce` - aborts the current action force (`actions:force` contribution point required)

## 1.0.0-pre.8

### Breaking changes

- The `RCEContext` interface no longer has the following properties: `name`, `action`.
- You may now get some extra type errors on action definitions where you wouldn't previously. Read below for more information.

### Added

- You may now use a [Standard JSON Schema](https://standardschema.dev/json-schema) compliant validator library to construct your schemas, instead of a normal JSON schema.
    - To allow for typing support with this, a new `defineAction` identity function has been added to the package. This function simply wraps an action, and provides type hints for action data in the context object.
    - Schema validation is still done with the `jsonschema` library. Refinements and modifications by the validation library is not allowed and will not be performed. Types for the action data reflect this (they use the validation schema's input types, not output types).
    - RCEContext will default to `unknown` for normal JSON schemas. This may now cause type errors in your code when it wouldn't previously.
    - Some validation library examples:
    
    ```ts
    // Zod
    import { defineAction } from '@vsc-neuropilot/api-types';
    import { z } from 'zod';

    const zodAction = defineAction({
        name: 'zod_action',
        description: 'Zod action',
        schema: z.object({
            name: z.string().optional()
        }),
        handler: (ctx /* ctx.data is typed! */) => {
            const name = ctx.data.params.name // should not cause errors even without null checking or assertions
        }
    })

    // Valibot
    import { defineAction } from '@vsc-neuropilot/api-types';
    import { v } from 'valibot';
    import { toStandardJsonSchema } from '@valibot/to-json-schema';

    const valibotAction = defineAction({
        name: 'valibot_action',
        description: 'Valibot action',
        schema: v.object({
            name: v.optional(v.string())
        }),
        handler: (ctx /* ctx.data is typed! */) => {
            const name = ctx.data.params.name // should not cause errors even without null checking or assertions
        }
    })

    // ArkType
    import { defineAction } from '@vsc-neuropilot/api-types';
    import { type } from 'arktype';

    const arktypeAction = defineAction({
        name: 'arktype_action',
        description: 'ArkType action',
        schema: type({
            "name?": "string"
        }),
        handler: (ctx /* ctx.data is typed! */) => {
            const name = ctx.data.params.name // should not cause errors even without null checking or assertions
        }
    })
    ```

    Read the linked page about the Standard JSON Schema specification to determine if your library implements it, and how to use it.

## 1.0.0-pre.7

Nothing in terms of package functionality was fixed this update. However, git tags *should* hopefully be pushed from CI now.

Backfilling of tags may be done, not decided yet.

## 1.0.0-pre.6

### Fixed

- Fixed old `new RCECancelEvent` type that was incorrectly resolved to `any` because `RCECancelEvent` was changed to an interface.

## 1.0.0-pre.5

### Added

- Added a `config` property to the API that contains configuration values and IDs. This replaces the settings enum from 1.0.0-pre.3.

### Fixed

- Replaced classes in the API with interfaces (attempting to construct a class would previously throw an error at runtime).

### Removed

- Removed the settings enum added in 1.0.0-pre.3 and replaced it with a config object.

## 1.0.0-pre.4

### Changed

- `RCEAction.contextSetupHook` is now pluralized to `contextSetupHooks`, matching that it's an array.
- `RCEAction.storage` can no longer be set to undefined.

## 1.0.0-pre.3

### Added

- An enum containing strings to certain settings, provided for backwards compatibility reasons.
    - Note that setting names themselves are not under API SemVer compliance.
        - For this reason, it is recommended to use the new enum when needing to access NeuroPilot's settings.
        - Example:

          ```ts
          import * as vscode from 'vscode';
          import { NeuroPilotSetting } from '@vsc-neuropilot/api-types'

          vscode.workspace.getConfiguration(`neuropilot.${NeuroPilotSetting.GameName}`)
          ```

## 1.0.0-pre.2

### Added

- Documentation regarding versioning to the draft 1.0.0 changelog
- Interfaces for setting file and text preview effects
- Extra file path utils and workspace utils. These are mostly for backwards compatibility.

### Changed

- Changed the interface where a `CancelEvent` can be constructed. Now, instead of being accessible freely via the public utils object, it is moved to the Companion class, inside the actionUtils object.
- Changed the interface where the `isPathNeuroSafe` method can be called. Now, instead of being callable from the root of the public utils object, it is nested inside the new file path utils subobject.

## 1.0.0-pre.1

Added some documentation to the package.

## 1.0.0-pre.0

API is now released as a public preview! To start, you'll need to install the extension build currently on the `api-branch` branch of https://github.com/VSC-NeuroPilot/neuropilot
You should be able to get that from GitHub Actions, or you can clone the repo locally, checkout the branch and build it yourself.
In the future, there will be a small CLI utility to help out with obtaining prerelease versions.

Some things to note:

- API design and functionality is not finalized. Whilst we are confident that the shape of the API will remain mostly the same throughout this public preview period, it's likely that actual functionality will be stopped.
- Docs aren't quite ready yet, ignore the broken link on README
- You may or may not be able to immediately use companions built during this period with the 3.0.0 release (whenever it rolls around).

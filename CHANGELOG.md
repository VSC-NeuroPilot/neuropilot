<!-- markdownlint-disable -->

# NeuroPilot changelog

Since v2.1.0, we're keeping a changelog of each version's changes in NeuroPilot.

Changes between each version before then will not be listed.

## 2.2.0

### New settings

- `neuropilot.connection.*` category, which includes:
  - `websocketUrl`, `gameName` and `initialContext` settings, which were moved from their `neuropilot.*` variants.
    - The old settings have now been deprecated.
  - `autoConnect`, which controls whether or not NeuroPilot will auto-connect to the Neuro API on startup.
  - `retryAmount`, which dictates how many times NeuroPilot will attempt to *re*connect to the Neuro API. The _total_ amount of tries will be this value + 1. 
  - `retryInterval`, which controls the amount of time to wait between each retry.
- `neuropilot.enableCancelEvents` - Whether or not to enable cancel events. See below for an explainer.
- New permission for getting the user's cursor / selection: `neuropilot.permission.getUserSelection`

### New commands

- `neuropilot.disconnect` - Disconnects from the Neuro API without reconnecting.
- `neuropilot.sendSelectionToNeuro` - Sends the current cursor selection to Neuro.

### Added features

- A popup reminder is now shown to users after each extension update, prompting them to check the changelog and documentation. The popup includes direct links to both resources and only appears once per version update.
- A tooltip will now show when hovering over Neuro-highlighted text, indicating that Neuro highlighted it, and how (either through finding text or manually).
- There is now an option to send the current cursor selection to Neuro. This can be invoked either by command or through right-click context menu. These options will only appear when *your cursor* is highlighting code.
- There is a new detector ran on startup to look for deprecated settings and if found, will ask you to migrate them. You can choose to not show that notice ever again by selecting the "Don't show again" option. This persists across sessions.
- The RCE framework now has a new component: **cancellation events**.
  - This automatically cancels Neuro's action requests if certain events happen.
  - Example: If Neuro wants to insert text, that request will auto-cancel if the active file is switched.
  - You can disable this with the new `Enable Cancel Events` setting (defaulted to on).
- Neuro can now get and replace the user's current selection.
  - This only works in Neuro-safe files.
  - This requires the new permissions *Get User Selection* and *Edit Active Document*.

### Changes

- Changed the colour of Neuro's highlight.
  - AHHHH MY EYES - Vedal
  - The specific colour used now is RGBA 202 22 175 1 as opposed to RGBA 255 255 0 1.
- Some Copilot mode prompts for editing actions have been rewritten majorly to properly reflect the options available to Neuro.
- Upon connection or disconnection from the API, the message that pops up now has extra buttons to either quickly re-/dis-connect or to change the Auto-Connect settings.
- Clarified whose cursor will be moved in action descriptions and contexts.
- Context returned from editing actions now uses a common format.

### Fixes

- Fixed automatically opening files created by Neuro when she only has Copilot permission for opening files.
- `rename_git_remote` now has a Git extension validator attached to it, matching all other Git actions.
- Fixed Neuro not being able to create a terminal that was killed by the user before.
- Usage of CRLF and LF in context was inconsistent across actions, and sometimes even inconsistent within the same context. This has now (hopefully) been fixed to only use LF.
- Line numbers should now appear for all actions.

## 2.1.2

### New settings

- `neuropilot.includePattern`, `neuropilot.excludePattern` and `neuropilot.allowUnsafePaths` are now moved to their `neuropilot.access.*` variants. These old settings have been deprecated and will display a warning in VS Code.
  - In addition, the settings have been changed:
    - `neuropilot.access.includePatterns` and `neuropilot.access.excludePatterns` are now each an array of strings instead of a big string separated by newlines.
    - `neuropilot.allowUnsafePaths` has been split into 3 separate settings for their respective uses: `neuropilot.access.dotFiles`, `neuropilot.access.externalFiles` and `neuropilot.access.environmentVariables`.

### Added features

- Changing permissions will now automatically reload permissions.
  - This also applies if you change the list of disabled actions.
  - The `Reload Permissions` command is still available in case you need to reload manually.

### Changes

- Further clarified when line and column numbers are one-based and zero-based for editing actions.

### Fixes

- Added missing entries to the 2.1.0 changelog.
  - (I forgot to push them before publishing)
  - Look at [dd06c39](https://github.com/VSC-NeuroPilot/neuropilot/commit/dd06c393a8b37d13db08189c30f95bee8fb4b356) for what exactly was added.
- Fixed line range validator not working correctly.
- Added missing line range validator to `find_text` action.
- Fixed Include and Exclude Patterns not working with uppercase characters.
  - Include and Exclude Patterns are now case-sensitive (except for drive letters).
- Fixed actions that access the file system not working in virtual workspaces.
- Direct terminal access cannot be enabled in untrusted workspaces now (didn't work before because of wrong setting ID).
- "Disable All Permissions" kill switch command now unregisters all actions again.
  - They were still being blocked before, just not unregistered.
  - It will also spam Neuro with register/unregister commands but if you have to use this she probably deserves it.
- "Disable All Permissions" kill switch command now blocks all permissions instantly.

## 2.1.1

### Meta changes

We have now consolidated back to using `NeuroPilot` as the display name on both VS Marketplace and Open VSX.
The namespace will remain on `vsc-neuropilot.neuropilot-base` to ensure parity across both registries.

## 2.1.0

This update was made in response to the Evil dev stream on 2025-08-28. [Here's the VoD, courtesy of Neuro Archiver](https://www.youtube.com/watch?v=AIYaBYVX95o).

### New actions

- Added `get_content` action which sends the current file's contents. This works more or less the same as the Send Current File as Context command.
- Added `insert_lines` action which inserts text below a certain line. This also makes new lines if necessary.
- Added `rewrite_all` action which rewrites the entire file immediately. (Thanks [frogneko](https://github.com/frogneko)!)
- Added `rewrite_lines` action which rewrites text in between a specified line range and moves the cursor to the end of the last added line. (Thanks [frogneko](https://github.com/frogneko)!)
- Added `delete_lines` action which deletes text in between a specificed range and moves the cursor to the end of the line before the deleted lines. (Thanks [frogneko](https://github.com/frogneko)!)
- Added `highlight_lines` action which selects text in a specified range and moves moves the view there.
- Added `read_file` action which returns the entire contents of a file in the workspace without opening it.

### New settings

- You can now optionally specify a format for line numbers in code context with the settings `lineNumberContextFormat`.
  - The `find_text` action now also uses this format.
- You can now specify how Neuro will get the cursor position with the setting `cursorPositionContextStyle`.
- All actions can now be individually disabled using the new setting `disabledActions`.
- Added new setting `sendContentsOnFileChange` (see below).

### Added features

- We now have a changelog! These changelogs should appear inside VS Code.
- The extension is now bundled with esbuild.
- Added support for web environments.
- `CNAME` (the file usually used to set a custom domain name) has now been added to the default list of Exclude Patterns that the connected Neuro twin cannot access.
- Actions `replace_text`, `delete_text` and `find_text` now allow specifying a line range to search in.
- Invalid cursor positions now fail at RCE validation time instead of execution time. This should improve the experience when using Copilot mode with editing actions.
- Code context now includes the total number of lines in the file.
- Neuro will now be notified when the editor changes (e.g. by opening a file or switching to another tab).
  - By default, Neuro will get the contents of the file if it is Neuro-safe, this can be configured with the setting `sendContentsOnFileChange`.
- All editing actions now have a 100,000 character limit. If this is exceeded, the action will be rejected. (Thanks [frogneko](https://github.com/frogneko)!)
- Editing actions now highlight Neuro's latest edit.
  - Deletions and modifications show the deleted or replaced text as a tooltip.
  - The highlights will be cleared when the document is changed or edited.
- Added a new validator for `diff_files` action.

### Changes

- All editing actions that move the cursor now mention in their description that the cursor moves after usage.
- Certain actions have had usage instructions clarified in their description.
- The context message to send the current file to the connected Neuro twin is changed to indicate that Vedal used the command.
- The way that the open docs commands works now is slightly different, now having a dropdown to select instead of opening our own docs directly. This is in preparation for our public API for extending NeuroPilot.
  - For now, you'll be selecting the `NeuroPilot` option most/all of the time.
- Increased the default context size around the cursor from 10 to 500.
- Terminal actions and tasks are no longer available in untrusted workspaces.
- Disconnection message is now a warning instead of an info.

### Fixes

- All actions with a schema now specify `additionalProperties: false`.
  - This caused problems on the dev stream because Evil tried to specify line and column for `insert_text`, which wasn't a thing yet.
  - While this is marked as "probably not supported" by the Neuro API spec, NeuroPilot checks the action against the schema via the `jsonschema` library, so enforcement will still happen, albeit on NeuroPilot's side instead of the Neuro API server. If you are testing with tools like Tony or Jippity, you can safely ignore the warning.
- The NeuroPilot v1 icon now shows in the gutter (the area to the left of the line count in a file). This already did show, even on stream, but after moving all assets into /assets/ we forgot to change it on dev branch.
  - And yes, this was never pushed to production, so technically this isn't a noteworthy "change", but it's here now.
- CRLF conversion offset has been fixed when using `insert_text`.
- Docs are now hosted at [a different subpage](https://vsc-neuropilot.github.io/docs) than before. While this isn't part of the extension itself, the link on the README file broke as a result of this change. This has now been fixed.
- The setting `cursorFollowsNeuro` now actually scrolls to the cursor position.
- Fixed security vulnerabilities from imports.

<!-- ### Removed features -->

<!-- (None) -->

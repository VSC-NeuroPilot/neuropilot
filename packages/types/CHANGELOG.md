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

- Pre-release versions (x.x.x-pre.x) are unstable releases for the designated API version. These contain work-in-progress types and annotations. Pre-release versions are not meant to be used except for trying out new API interfaces and giving feedback, and may change without prior programmatic notice. Pre-release versions are meant to be used with new builds from the `dev` branch of the base extension repo.
- Release candidates (x.x.x-rc.x) are stable previews for the designated API version. These contain types that are more or less finalized for the designated release. Breaking changes should not be expected, both in type signature and functionality, but will always be highlighted in the changelog if necessary. This is also meant for feedback, but only for more subtle feedback before releasing that version such that it simply just contains bug fixes and very minor changes.

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

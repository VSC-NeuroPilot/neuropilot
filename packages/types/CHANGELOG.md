<!-- markdownlint-disable -->

# API updates

This changelog details the changes between API versions.

## (Draft) 1.0.0

This is the first release of the API. The versioning will be as follows:

- Patch versions (x.x.x) do not contain breaking changes or change warnings. These patch versions contain either non-breaking type changes or JSDoc annotation updates. In other words, you can often upgrade patch versions without much hassle.
- Minor versions (x.x.0) do not contain breaking changes, but may contain change warnings. Change warnings act as early signals that your code may need to be changed in the upcoming major. Additionally, minor versions also add new APIs and may indicate minor functionality changes (without changing the type signature). Minor versions will *generally* maintain backwards compatibility.
- Major versions (x.0.0) contain breaking changes. These breaking changes will most likely force you to change your code to handle the new type signatures and functionality. It is recommended to thoroughly test your code before upgrading to this version. Major versions can break backwards compatibility.

Each higher version type can also inherit characteristics from the lower version types.

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

<!-- markdownlint-disable -->

# API updates

This changelog details the changes between API versions.

## 1.0.0

This is the first release of the API. The versioning will be as follows:

- Patch versions (x.x.x) do not contain breaking changes or change warnings. These patch versions contain either non-breaking type changes or JSDoc annotation updates. In other words, you can often upgrade patch versions without much hassle.
- Minor versions (x.x.0) do not contain breaking changes, but may contain change warnings. Change warnings act as early signals that your code may need to be changed in the upcoming major. Additionally, minor versions also add new APIs and may indicate minor functionality changes (without changing the type signature). Minor versions will maintain backwards compatibility.
- Major versions (x.0.0) contain breaking changes. These breaking changes will most likely force you to change your code to handle the new type signatures and functionality. It is recommended to thoroughly test your code before upgrading to this version. Major versions break backwards compatibility.

Each higher version type can also inherit characteristics from the lower version types.

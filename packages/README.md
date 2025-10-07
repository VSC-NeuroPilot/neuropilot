# NeuroPilot sub-packages

These are subpackages for the extension, mostly focused on the API.

## Packages

There are 3 packages:

- [the API types](./api-types/);
- [the API helper tools](./api-helper/); and
- [the mini CLI](./cli/)

## Bundler

The main extension uses `tsc` + `esbuild` to build the extension for distribution. However, this is not also followed in the packages, since they use `rollup` instead. This is because `rollup` is more tailored to libraries and (to an extent) CLIs and is also more pluggable. `esbuild` works fine for the extension and is in fact a bit faster than `rollup`, as such it will remain as the extension's bundler.

In the future, once `rolldown` is fully stable, it is planned to migrate all sub-packages to use `rolldown` for a drop-in performance boost. Migration of the extension itself from `tsc` + `esbuild` to solo `rolldown` for parity & reduced complexity is still being considered.

# Types package notes

## peerDependencies & devDependencies

- Peer dependencies require that we also satisfy it during dev, for this reason devDependencies is a superset of these.
- The `neuro-game-sdk` dependency is a bit heavy, Rollup experimentation to get it to output types with only types from the SDK bundled is ongoing. This way, we can move it to devDependencies.

## Utils types

- The `RCECancelEvent` class is breaking with the `@events/utils` version. Not sure how to resolve quite yet.

## Client helper types

- Currently combines some types from both `neuro_client_helpers.ts` and `rce.ts`. No plans to change.

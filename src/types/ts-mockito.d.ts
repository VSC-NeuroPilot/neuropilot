/*
Minimal ambient declarations for ts-mockito to satisfy type-checking in tests
Why this exists:
- ts-mockito ships its own type definitions, but our web test TypeScript config
  (see test-tsconfigs/tsconfig.web.json) targets WebWorker libs and intentionally
  omits Node types. The official ts-mockito typings may pull in Node types, which
  would force us to enable `node` types/globals for web tests.
- Enabling Node types in the web config is undesirable, since it pollutes the
  browser-targeted environment with Node globals.

This ambient declaration only exposes the subset of ts-mockito APIs we use with
permissive types. It keeps both desktop and web test builds type-clean without
adding Node typings to the web configuration.

If you remove this file, consider either:
- adding `node` to `types` in test-tsconfigs/tsconfig.web.json; or
- excluding ts-mockito-dependent tests from the web runner.
*/
declare module 'ts-mockito' {
    export function mock<T>(clazz?: new (...args: any[]) => T): T;
    export function instance<T>(mocked: T): T;
    export function verify<T>(value: any): any;
    export function capture<T>(value: any): {
        first(): [any, ...any[]];
        second(): [any, ...any[]];
        third(): [any, ...any[]];
        last(): [any, ...any[]];
    };
    export function anything(): any;
    export function anyString(): string;
    export function spy<T>(instance: T): T;
    export function reset<T>(mocked: T): void;
}

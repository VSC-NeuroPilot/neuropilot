import { SchemaTypes, InferDataFromSchema, RCEAction } from './types';

export type * from './classes.d';
export * from './enums';
export type * from './types';

/**
 * Define an action with proper type inference for schema, input data, and event types.
 * @param action The action definition
 * @returns The same action with full type inference
 * @example
 * // Event type is inferred from cancelEvents
 * defineAction({
 *   name: 'my_action',
 *   schema: z.object({ file: z.string() }),
 *   handler: (ctx) => actionHandlerSuccess(),
 *   cancelEvents: [(ctx) => new RCECancelEvent<vscode.FileDeleteEvent>({ ... })],
 *   // ...
 * });
 */
/* @__NO_SIDE_EFFECTS__ */
export function defineAction<
    const TData extends object | undefined,
    const TSchema extends SchemaTypes,
    const TInput extends InferDataFromSchema<TSchema>,
>(action: RCEAction<TData, TSchema, TInput>): RCEAction<TData, TSchema, TInput> {
    return action;
}

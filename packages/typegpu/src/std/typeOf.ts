import { isData, type AnyData } from '../data/dataTypes.ts';
import { setName } from '../shared/meta.ts';
import { $gpuCallable, $internal } from '../shared/symbols.ts';
import { coerceToSnippet } from '../tgsl/generationHelpers.ts';
import type { GPUCallable } from '../types.ts';

interface TypeOf extends GPUCallable {
  (arg: unknown): AnyData | undefined;
}

/**
 * Returns the type of an expression, the one it will have during shader execution. That information can
 * be used to introspect or specialize the shader. It will return `undefined` if the expression cannot
 * be represented in shader code, or if the type is unknown at the point where the query is made.
 *
 * The returned value is only known at shader-generation time and has no WGSL representation, so it
 * cannot be stored in a variable (e.g. `const t = std.typeOf(a)` throws). Consume it immediately,
 * e.g. by comparing it (`std.typeOf(a) === d.f32`) or passing it to a comptime function.
 *
 * @example
 * function double(value: number) {
 *   'use gpu';
 *   if (std.typeOf(value) === d.f32) {
 *     return value * 2;
 *   }
 *   return value << 1;
 * }
 *
 * function main() {
 *   'use gpu';
 *   double(1.5); // generates double(f32), which multiplies by 2
 *   double(1); // generates double(i32), which shifts left by 1
 * }
 */
export const typeOf = ((): TypeOf => {
  const impl = (() => {
    // Deducing the WGSL type of a value at comptime is near-impossible with
    // the current comptime type flowing. We can lift this restriction once it
    // becomes more capable.
    throw new Error(
      'std.typeOf() cannot be called in JS, it can only be used in the GPU context. You can use std.isBeingTranspiled() to branch off and provide a fallback.',
    );
  }) as unknown as TypeOf;

  setName(impl, 'typeOf');
  impl.toString = () => 'typeOf';
  impl[$gpuCallable] = {
    call(_ctx, args) {
      const [arg] = args;
      if (!arg || args.length > 1) {
        throw new Error(`std.typeOf() expects exactly one argument, got ${args.length}`);
      }
      const type = arg.dataType;
      // Only public data types are exposed. Unknown types and internal types
      // (e.g. AutoStruct, EntryInputRouter) must not leak to the user.
      if (!isData(type)) {
        return coerceToSnippet(undefined);
      }

      return coerceToSnippet(type);
    },
  };
  // Mark as internal
  Object.defineProperty(impl, $internal, { value: true });

  return impl;
})();

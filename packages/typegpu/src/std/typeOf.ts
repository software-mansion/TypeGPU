import { AutoStruct } from '../data/autoStruct.ts';
import { UnknownData, type AnyData } from '../data/dataTypes.ts';
import { bool } from '../data/numeric.ts';
import { $gpuCallable, $internal } from '../shared/symbols.ts';
import { coerceToSnippet } from '../tgsl/generationHelpers.ts';
import type { GPUCallable } from '../types.ts';

interface TypeOf extends GPUCallable {
  (arg: unknown): AnyData | undefined;
}

// TODO: Idea, maybe concretize types automatically?
export const typeOf = ((): TypeOf => {
  const impl: TypeOf = (arg) => {
    // TODO: Determine more types from values
    if (typeof arg === 'boolean') {
      return bool;
    }
    return undefined;
  };

  impl.toString = () => 'typeOf';
  impl[$gpuCallable] = {
    call(_ctx, args) {
      const [arg] = args;
      if (!arg || args.length > 1) {
        throw new Error(`std.typeOf() expects exactly one argument, got ${args.length}`);
      }
      const type = arg.dataType;
      if (type === UnknownData || type instanceof AutoStruct) {
        return undefined;
      }

      return coerceToSnippet(type);
    },
  };
  // Mark as internal
  Object.defineProperty(impl, $internal, {});

  return impl;
})();

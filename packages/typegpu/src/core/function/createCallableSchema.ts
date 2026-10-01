import {
  type MapValueToSnippet,
  noSideEffects,
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../../data/snippet.ts';
import { type BaseData, isPtr } from '../../data/wgslTypes.ts';
import { setName } from '../../shared/meta.ts';
import { $gpuCallable } from '../../shared/symbols.ts';
import { tryConvertSnippet } from '../../tgsl/conversion.ts';
import { type DualFn, isKnownAtComptime, NormalState, type ResolutionCtx } from '../../types.ts';
import type { AnyFn } from './fnTypes.ts';
import { type CollapsedNumericType, isNumericTypeVar } from '../../data/numericTypeVar.ts';

type MapValueToDataType<T> = { [K in keyof T]: BaseData };

interface CallableSchemaOptions<T extends AnyFn> {
  readonly name: string;
  readonly schema: () => BaseData;
  readonly normalImpl: T;
  readonly codegenImpl: (
    ctx: ResolutionCtx,
    args: MapValueToSnippet<Parameters<T>>,
  ) => ResolvedSnippet;
  readonly argTypes: (
    ...inArgTypes: MapValueToDataType<Parameters<T>>
  ) => (BaseData | BaseData[])[];
}

const scalarCastTargets = ['f32', 'f16', 'i32', 'u32'];

export function callableSchema<T extends AnyFn>(options: CallableSchemaOptions<T>): DualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    return options.normalImpl(...args);
  }) as DualFn<T>;

  setName(impl, options.name);
  impl.toString = () => options.name;
  impl[$gpuCallable] = {
    get strictSignature() {
      return undefined;
    },
    call(ctx, args) {
      const schema = options.schema();
      const argType = args[0]?.dataType;
      if (
        args.length === 1 &&
        isNumericTypeVar(argType) &&
        scalarCastTargets.includes(schema.type)
      ) {
        // Explicitly casting a variable of an undecided numeric type decides the type,
        // e.g. `d.i32(i)` makes `i` an i32. The variable holds a whole number, so there is no loss.
        argType.collapse(schema as CollapsedNumericType);
      }

      const argTypes = options.argTypes(
        ...(args.map((s) => {
          // Dereference implicit pointers
          if (isPtr(s.dataType) && s.dataType.implicit) {
            return s.dataType.inner;
          }
          return s.dataType;
        }) as MapValueToDataType<Parameters<T>>),
      );

      const converted = args.map((s, idx) => {
        const argType = argTypes[idx];
        if (!argType) {
          throw new Error('Function called with invalid arguments');
        }
        return tryConvertSnippet(ctx, s, argType, false);
      }) as MapValueToSnippet<Parameters<T>>;

      let result: Snippet;
      if (converted.every((s) => isKnownAtComptime(s))) {
        ctx.pushMode(new NormalState());
        try {
          result = snip(
            options.normalImpl(...(converted.map((s) => s.value) as never[])),
            options.schema(),
            // Functions give up ownership of their return value
            /* origin */ 'constant',
          );
        } finally {
          ctx.popMode('normal');
        }
      } else {
        result = options.codegenImpl(ctx, converted);
      }

      if (!args.some((a) => a.possibleSideEffects)) {
        return noSideEffects(result);
      }
      return result;
    },
  };

  return impl;
}

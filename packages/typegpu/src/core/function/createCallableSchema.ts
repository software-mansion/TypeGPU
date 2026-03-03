import { type MapValueToSnippet, snip } from '../../data/snippet.ts';
import { type BaseData, isPtr } from '../../data/wgslTypes.ts';
import { setName } from '../../shared/meta.ts';
import { $gpuCallable } from '../../shared/symbols.ts';
import { tryConvertSnippet } from '../../tgsl/conversion.ts';
import { type DualFn, isKnownAtComptime, NormalState, type ResolutionCtx } from '../../types.ts';
import type { AnyFn } from './fnTypes.ts';

type MapValueToDataType<T> = { [K in keyof T]: BaseData };

interface CallableSchemaOptions<T extends AnyFn> {
  readonly name: string;
  readonly normalImpl: T;
  readonly codegenImpl: (ctx: ResolutionCtx, args: MapValueToSnippet<Parameters<T>>) => string;
  readonly signature: (...inArgTypes: MapValueToDataType<Parameters<T>>) => {
    argTypes: (BaseData | BaseData[])[];
    returnType: BaseData;
  };
}

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
      const { argTypes, returnType } = options.signature(
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

      if (converted.every((s) => isKnownAtComptime(s))) {
        ctx.pushMode(new NormalState());
        try {
          return snip(
            options.normalImpl(...(converted.map((s) => s.value) as never[])),
            returnType,
            // Functions give up ownership of their return value
            /* origin */ 'constant',
          );
        } finally {
          ctx.popMode('normal');
        }
      }

      return snip(
        options.codegenImpl(ctx, converted),
        returnType,
        // Functions give up ownership of their return value
        /* origin */ 'runtime',
      );
    },
  };

  return impl;
}

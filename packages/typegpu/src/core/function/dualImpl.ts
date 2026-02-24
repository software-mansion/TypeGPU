import { type MapValueToSnippet, snip } from '../../data/snippet.ts';
import { setName } from '../../shared/meta.ts';
import { $gpuCallable } from '../../shared/symbols.ts';
import { tryConvertSnippet } from '../../tgsl/conversion.ts';
import { concretize } from '../../tgsl/generationHelpers.ts';
import {
  type DualFn,
  isKnownAtComptime,
  NormalState,
  type ResolutionCtx,
} from '../../types.ts';
import { type BaseData, isPtr } from '../../data/wgslTypes.ts';

type MapValueToDataType<T> = { [K in keyof T]: BaseData };
type AnyFn = (...args: never[]) => unknown;

interface DualImplOptions<T extends AnyFn> {
  readonly name: string | undefined;
  readonly normalImpl: T | string;
  readonly codegenImpl: (
    ctx: ResolutionCtx,
    args: MapValueToSnippet<Parameters<T>>,
  ) => string;
  readonly signature:
    | {
      argTypes: (BaseData | BaseData[])[];
      returnType: BaseData;
    }
    | ((
      ...inArgTypes: MapValueToDataType<Parameters<T>>
    ) => { argTypes: (BaseData | BaseData[])[]; returnType: BaseData });
  /**
   * Whether the function should skip trying to execute the "normal" implementation if
   * all arguments are known at compile time.
   * @default false
   */
  readonly noComptime?: boolean | undefined;
  readonly ignoreImplicitCastWarning?: boolean | undefined;
}

export class MissingCpuImplError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = this.constructor.name;
  }
}

export function dualImpl<T extends AnyFn>(
  options: DualImplOptions<T>,
): DualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (typeof options.normalImpl === 'string') {
      throw new MissingCpuImplError(options.normalImpl);
    }
    return options.normalImpl(...args);
  }) as DualFn<T>;

  setName(impl, options.name);
  impl.toString = () => options.name ?? '<unknown>';
  impl[$gpuCallable] = {
    get strictSignature() {
      return typeof options.signature !== 'function'
        ? options.signature
        : undefined;
    },
    call(ctx, args) {
      const { argTypes, returnType } = typeof options.signature === 'function'
        ? options.signature(
          ...args.map((s) => {
            // Dereference implicit pointers
            if (isPtr(s.dataType) && s.dataType.implicit) {
              return s.dataType.inner;
            }
            return s.dataType;
          }) as MapValueToDataType<Parameters<T>>,
        )
        : options.signature;

      const converted = args.map((s, idx) => {
        const argType = argTypes[idx];
        if (!argType) {
          throw new Error('Function called with invalid arguments');
        }
        return tryConvertSnippet(
          ctx,
          s,
          argType,
          !options.ignoreImplicitCastWarning,
        );
      }) as MapValueToSnippet<Parameters<T>>;

      if (
        !options.noComptime &&
        converted.every((s) => isKnownAtComptime(s)) &&
        typeof options.normalImpl === 'function'
      ) {
        ctx.pushMode(new NormalState());
        try {
          return snip(
            options.normalImpl(...converted.map((s) => s.value) as never[]),
            returnType,
            // Functions give up ownership of their return value
            /* origin */ 'constant',
          );
        } catch (e) {
          // cpuImpl may in some cases be present but implemented only partially.
          // In that case, if the MissingCpuImplError is thrown, we fallback to codegenImpl.
          // If it is any other error, we just rethrow.
          if (!(e instanceof MissingCpuImplError)) {
            throw e;
          }
        } finally {
          ctx.popMode('normal');
        }
      }

      return snip(
        options.codegenImpl(ctx, converted),
        concretize(returnType),
        // Functions give up ownership of their return value
        /* origin */ 'runtime',
      );
    },
  };

  return impl;
}

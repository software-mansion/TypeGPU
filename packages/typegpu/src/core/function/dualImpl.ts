import { type MapValueToSnippet, snip } from '../../data/snippet.ts';
import { setName } from '../../shared/meta.ts';
import { $gpuCallable } from '../../shared/symbols.ts';
import { tryConvertSnippet } from '../../tgsl/conversion.ts';
import { concretize } from '../../tgsl/generationHelpers.ts';
import { type DualFn, isKnownAtComptime, NormalState, type ResolutionCtx } from '../../types.ts';
import { type BaseData, isPtr } from '../../data/wgslTypes.ts';
import { roundToF16 } from '../../data/numeric.ts';
import { WgslTypeError } from '../../errors.ts';

type MapValueToDataType<T> = { [K in keyof T]: BaseData };
type AnyFn = (...args: never[]) => unknown;

interface DualImplOptions<T extends AnyFn> {
  readonly name: string | undefined;
  readonly normalImpl: T | string;
  readonly codegenImpl: (
    ctx: ResolutionCtx,
    args: MapValueToSnippet<Parameters<T>>,
    returnType: BaseData,
  ) => string;
  readonly signature:
    | {
        argTypes: (BaseData | BaseData[])[];
        returnType: BaseData;
      }
    | ((...inArgTypes: MapValueToDataType<Parameters<T>>) => {
        argTypes: (BaseData | BaseData[])[];
        returnType: BaseData;
      });
  /**
   * Whether the function should skip trying to execute the "normal" implementation if
   * all arguments are known at compile time.
   * @default false
   */
  readonly noComptime?: boolean | undefined;
  readonly ignoreImplicitCastWarning?: boolean | undefined;
  /**
   * Whether calling this function is a side-effect in itself, irrespective of
   * its arguments. Examples:
   *
   * - `discard` -> `true` - it discards the fragment.
   * - `workgroupBarrier()` -> `true` - the barrier synchronizes threads.
   * - `sin(x)`, `abs(x)` -> `false` - these are purely value-producing; the
   *   call itself has no observable effect beyond the returned value.
   *
   * When `false`, the result inherits side-effects from its arguments: it
   * only has `possibleSideEffects: true` if at least one argument does.
   */
  readonly sideEffects: boolean;
}

export class MissingCpuImplError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = this.constructor.name;
  }
}

export function dualImpl<T extends AnyFn>(options: DualImplOptions<T>): DualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (typeof options.normalImpl === 'string') {
      throw new MissingCpuImplError(options.normalImpl);
    }
    return options.normalImpl(...args);
  }) as DualFn<T>;

  if (options.name) {
    setName(impl, options.name);
  }
  impl.toString = () => options.name ?? '<unknown>';
  impl[$gpuCallable] = {
    get strictSignature() {
      return typeof options.signature !== 'function' ? options.signature : undefined;
    },
    call(ctx, args) {
      const { argTypes, returnType } =
        typeof options.signature === 'function'
          ? options.signature(
              ...(args.map((s) => {
                // Dereference implicit pointers
                if (isPtr(s.dataType) && s.dataType.implicit) {
                  return s.dataType.inner;
                }
                return s.dataType;
              }) as MapValueToDataType<Parameters<T>>),
            )
          : options.signature;

      const converted = args.map((s, idx) => {
        const argType = argTypes[idx];
        if (!argType) {
          throw new Error('Function called with invalid arguments');
        }
        return tryConvertSnippet(ctx, s, argType, !options.ignoreImplicitCastWarning);
      }) as MapValueToSnippet<Parameters<T>>;

      if (
        !options.noComptime &&
        converted.every((s) => isKnownAtComptime(s)) &&
        typeof options.normalImpl === 'function'
      ) {
        ctx.pushMode(new NormalState());
        try {
          return snip(
            fitComptimeResult(
              options.normalImpl(...(converted.map((s) => s.value) as never[])),
              returnType,
              options.name,
            ),
            returnType,
            // Functions give up ownership of their return value
            /* origin */ 'constant',
            options.sideEffects,
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

      const possibleSideEffects = options.sideEffects || args.some((a) => a.possibleSideEffects);

      const concreteReturnType = concretize(returnType);
      return snip(
        options.codegenImpl(ctx, converted, concreteReturnType),
        concreteReturnType,
        // Functions give up ownership of their return value
        /* origin */ 'runtime',
        possibleSideEffects,
      );
    },
  };

  return impl;
}

const I32_MIN = -(2 ** 31);
const I32_MAX = 2 ** 31 - 1;
const U32_MAX = 2 ** 32 - 1;

/**
 * The CPU implementations compute scalars with JS numbers (64-bit floats).
 * When a call is evaluated at compile time, we make the result behave like
 * WGSL would: floats are rounded to their precision, and integer overflow is
 * an error (like in WGSL constant expressions).
 */
function fitComptimeResult(value: unknown, returnType: BaseData, fnName: string | undefined) {
  if (typeof value !== 'number') {
    return value;
  }

  switch (returnType.type) {
    case 'f32':
      return Math.fround(value);
    case 'f16':
      return Number.isFinite(value) ? roundToF16(value) : value;
    case 'i32':
    case 'u32': {
      const min = returnType.type === 'i32' ? I32_MIN : 0;
      const max = returnType.type === 'i32' ? I32_MAX : U32_MAX;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new WgslTypeError(
          `The result of '${fnName ?? '<unknown>'}' evaluated at compile time (${value}) does not fit in ${returnType.type}. WGSL treats overflow in constant expressions as an error.`,
        );
      }
      return value;
    }
    default:
      return value;
  }
}

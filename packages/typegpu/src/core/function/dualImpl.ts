import type { DualFn } from '../../data/dualFn.ts';
import {
  type MapValueToSnippet,
  snip,
  type Snippet,
} from '../../data/snippet.ts';
import { inCodegenMode } from '../../execMode.ts';
import { type FnArgsConversionHint, isKnownAtComptime } from '../../types.ts';
import { setName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';
import { tryConvertSnippet } from '../../tgsl/conversion.ts';
import type { AnyData } from '../../data/dataTypes.ts';

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argConversionHint: FnArgsConversionHint = 'keep',
): DualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    }
    return jsImpl(...args);
  }) as T;

  setName(impl, name);
  impl.toString = () => name;
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl,
      gpuImpl,
      argConversionHint,
    },
  });

  return impl as DualFn<T>;
}

type MapValueToDataType<T> = { [K in keyof T]: AnyData };

interface DualImplOptions<T extends (...args: never[]) => unknown> {
  readonly name: string;
  readonly normalImpl: T | string;
  readonly codegenImpl: (...args: MapValueToSnippet<Parameters<T>>) => string;
  readonly signature:
    | { argTypes: AnyData[]; returnType: AnyData }
    | ((
      ...inArgTypes: MapValueToDataType<Parameters<T>>
    ) => { argTypes: AnyData[]; returnType: AnyData });
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

export function dualImpl<T extends (...args: never[]) => unknown>(
  options: DualImplOptions<T>,
): DualFn<T> {
  const gpuImpl = (...args: MapValueToSnippet<Parameters<T>>) => {
    const { argTypes, returnType } = typeof options.signature === 'function'
      ? options.signature(
        ...args.map((s) => {
          // Dereference implicit pointers
          if (s.dataType.type === 'ptr' && s.dataType.implicit) {
            return s.dataType.inner;
          }
          return s.dataType;
        }) as MapValueToDataType<Parameters<T>>,
      )
      : options.signature;

    const argSnippets = args as MapValueToSnippet<Parameters<T>>;
    const converted = argSnippets.map((s, idx) => {
      const argType = argTypes[idx] as AnyData | undefined;
      if (!argType) {
        throw new Error('Function called with invalid arguments');
      }
      return tryConvertSnippet(s, argType, !options.ignoreImplicitCastWarning);
    }) as MapValueToSnippet<Parameters<T>>;

    if (
      !options.noComptime &&
      converted.every((s) => isKnownAtComptime(s)) &&
      typeof options.normalImpl === 'function'
    ) {
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
      }
    }

    return snip(
      options.codegenImpl(...converted),
      returnType,
      // Functions give up ownership of their return value
      /* origin */ 'runtime',
    );
  };

  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...args as MapValueToSnippet<Parameters<T>>);
    }
    if (typeof options.normalImpl === 'string') {
      throw new MissingCpuImplError(options.normalImpl);
    }
    return options.normalImpl(...args);
  }) as T;

  setName(impl, options.name);
  impl.toString = () => options.name;
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl: options.normalImpl,
      gpuImpl,
      strictSignature: typeof options.signature !== 'function'
        ? options.signature
        : undefined,
      argConversionHint: 'keep',
    },
  });

  return impl as DualFn<T>;
}

import type { DualFn } from '../../data/dualFn.ts';
import {
  type MapValueToSnippet,
  snip,
  type Snippet,
} from '../../data/snippet.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { FnArgsConversionHint } from '../../types.ts';
import { setName } from '../../shared/meta.ts';
import { $internal, isRuntimeResource } from '../../shared/symbols.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { convertToCommonType } from '../../tgsl/conversion.ts';

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

type MapValueToDataType<T> = { [K in keyof T]: AnyWgslData };

interface DualImplOptions<T extends (...args: never[]) => unknown> {
  readonly name: string;
  readonly normalImpl: T;
  readonly codegenImpl: (...args: MapValueToSnippet<Parameters<T>>) => string;
  readonly signature:
    | { argTypes: AnyWgslData[]; returnType: AnyWgslData }
    | ((
      ...inArgTypes: MapValueToDataType<Parameters<T>>
    ) => { argTypes: AnyWgslData[]; returnType: AnyWgslData });
  readonly ignoreImplicitCastWarning?: boolean | undefined;
}

export function dualImpl<T extends (...args: never[]) => unknown>(
  options: DualImplOptions<T>,
): DualFn<T> {
  const gpuImpl = (...args: MapValueToSnippet<Parameters<T>>) => {
    const { argTypes, returnType } = typeof options.signature === 'function'
      ? options.signature(
        ...args.map((s) => s.dataType) as MapValueToDataType<Parameters<T>>,
      )
      : options.signature;

    const argSnippets = args as MapValueToSnippet<Parameters<T>>;
    const converted = argSnippets.map((s, idx) =>
      convertToCommonType(
        [s],
        [argTypes[idx] as AnyWgslData],
        !options.ignoreImplicitCastWarning,
      )?.[0] ?? s
    ) as MapValueToSnippet<Parameters<T>>;

    if (
      converted.every((s) =>
        typeof s.value !== 'string' && !isRuntimeResource(s.value)
      )
    ) {
      return snip(
        options.normalImpl(...converted.map((s) => s.value) as never[]),
        returnType,
      );
    }

    return snip(options.codegenImpl(...converted), returnType);
  };

  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...args as MapValueToSnippet<Parameters<T>>);
    }
    return options.normalImpl(...args);
  }) as T;

  setName(impl, options.name);
  impl.toString = () => options.name;
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl: options.normalImpl,
      gpuImpl,
      argConversionHint: 'keep',
    },
  });

  return impl as DualFn<T>;
}

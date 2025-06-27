import type { Snippet, TgpuDualFn } from '../data/dataTypes.ts';
import { inGPUMode } from '../gpuMode.ts';
import type { FnArgsConversionHint } from '../types.ts';
import { setName } from './meta.ts';
import { $internal } from './symbols.ts';

/**
 * Yields values in the sequence 0,1,2..∞ except for the ones in the `excluded` set.
 */
export function* naturalsExcept(
  excluded: Set<number>,
): Generator<number, number, unknown> {
  let next = 0;

  while (true) {
    if (!excluded.has(next)) {
      yield next;
    }

    next++;
  }
}

// nie ma symbolów, getterów, itp.
// function cloneWgslData<T>(item: T): T {
//   return structuredClone(item);
// }

// nie ma symbolów, getterów, itp.
// function cloneWgslData<T>(item: T): T {
//   if (item === null || typeof item !== 'object') {
//     return item;
//   }

//   return clone(item); // just-clone
// }

// wszystko jest tylko wektor staje się obiektem zamiast arraya, nie jest rekurencyjne
// function cloneWgslData<T>(item: T): T {
//   return Object.create(
//     Object.getPrototypeOf(item),
//     Object.getOwnPropertyDescriptors(item),
//   );
// }

// wszystko jest tylko wektor staje się obiektem zamiast arraya
// function cloneWgslData<T>(item: T): T {
//   if (item === null || typeof item !== 'object') {
//     return item;
//   }

//   const copy = Object.create(Object.getPrototypeOf(item)) as any;

//   for (
//     const key of [
//       ...Object.getOwnPropertyNames(item),
//       ...Object.getOwnPropertySymbols(item),
//     ]
//   ) {
//     const desc = Object.getOwnPropertyDescriptor(item, key)!;
//     if (desc.get || desc.set) {
//       Object.defineProperty(copy, key, desc);
//     } else {
//       copy[key] = cloneWgslData((item as any)[key]);
//     }
//   }

//   return copy;
// }

function cloneWgslData<T>(item: T): T {
  if (item === null || typeof item !== 'object') {
    return item;
  }

  if (Array.isArray(item)) {
    const arr = new (item.constructor as any)(
      ...item.map((v) => cloneWgslData(v)),
    );

    for (const key of Reflect.ownKeys(item) as (string | symbol)[]) {
      if (typeof key === 'string' && /^\d+$/.test(key)) continue;
      if (key === 'length') continue;

      const desc = Object.getOwnPropertyDescriptor(item, key)!;
      if ('value' in desc) {
        desc.value = cloneWgslData((item as any)[key]);
      }
      Object.defineProperty(arr, key, desc);
    }
    return arr as any;
  }

  const copy = Object.create(Object.getPrototypeOf(item)) as any;

  for (
    const key of [
      ...Object.getOwnPropertyNames(item),
      ...Object.getOwnPropertySymbols(item),
    ]
  ) {
    const desc = Object.getOwnPropertyDescriptor(item, key)!;
    if (desc.get || desc.set) {
      Object.defineProperty(copy, key, desc);
    } else {
      copy[key] = cloneWgslData((item as any)[key]);
    }
  }

  return copy;
}

type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argTypes?: FnArgsConversionHint,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inGPUMode()) {
      return gpuImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    }
    return jsImpl(...args.map((arg) => cloneWgslData(arg)));
  }) as T;

  (impl as TgpuDualFn<T>)[$internal] = {
    implementation: jsImpl,
    argTypes,
  };

  setName(impl, name);

  return impl as TgpuDualFn<T>;
}

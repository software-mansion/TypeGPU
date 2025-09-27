import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import { INTERNAL_createPtr } from '../data/ptr.ts';
import type { Snippet } from '../data/snippet.ts';
import {
  addressSpaceToDefaultAccess,
  isPtr,
  type StorableData,
} from '../data/wgslTypes.ts';
import { getMetaData } from '../shared/meta.ts';
import { concretize } from './generationHelpers.ts';

type AnyFn = (...args: never[]) => unknown;

function shallowEqualSchemas(a: AnyData, b: AnyData): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'ptr' && b.type === 'ptr') {
    return a.access === b.access &&
      a.addressSpace === b.addressSpace &&
      shallowEqualSchemas(a.inner, b.inner);
  }
  if (a.type === 'array' && b.type === 'array') {
    return a.elementCount === b.elementCount &&
      shallowEqualSchemas(a.elementType as AnyData, b.elementType as AnyData);
  }
  return true;
}

export class ShelllessRepository {
  cache = new Map<AnyFn, ShelllessImpl[]>();

  get(fn: AnyFn, argSnippets: Snippet[]): ShelllessImpl | undefined {
    const meta = getMetaData(fn);
    if (!meta?.ast) return undefined;

    const argTypes = argSnippets.map((s) => {
      const type = concretize(s.dataType as AnyData);
      const addressSpace = s.ref === 'this-function'
        ? 'function'
        : s.ref === 'constant' || s.ref === 'runtime'
        ? undefined
        : s.ref;

      return addressSpace !== undefined && !isPtr(type)
        ? INTERNAL_createPtr(
          addressSpace,
          type as StorableData,
          addressSpaceToDefaultAccess[addressSpace],
        )
        : type;
    });

    let cache = this.cache.get(fn);
    if (cache) {
      const variant = cache.find((v) =>
        v.argTypes.length === argTypes.length &&
        v.argTypes.every((t, i) =>
          shallowEqualSchemas(t, argTypes[i] as AnyData)
        )
      );
      if (variant) {
        return variant;
      }
    } else {
      cache = [];
      this.cache.set(fn, cache);
    }

    const shellless = createShelllessImpl(argTypes, fn);
    cache.push(shellless);
    return shellless;
  }
}

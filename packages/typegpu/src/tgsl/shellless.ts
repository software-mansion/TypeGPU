import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import { INTERNAL_createPtr } from '../data/ptr.ts';
import { refSpaceToPtrParams, type Snippet } from '../data/snippet.ts';
import { isPtr, type StorableData } from '../data/wgslTypes.ts';
import { getMetaData, getName } from '../shared/meta.ts';
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
  if (a.type === 'struct' && b.type === 'struct') {
    // Only structs with the same identity are considered equal
    return a === b;
  }
  return true;
}

export class ShelllessRepository {
  cache = new Map<AnyFn, ShelllessImpl[]>();

  get(
    fn: AnyFn,
    argSnippets: Snippet[] | undefined,
  ): ShelllessImpl | undefined {
    const meta = getMetaData(fn);
    if (!meta?.ast) return undefined;
    if (!argSnippets && meta.ast.params.length > 0) {
      throw new Error(
        `Cannot resolve '${
          getName(fn)
        }' directly, because it expects arguments. Either call it from another function, or wrap it in a shell`,
      );
    }

    const argTypes = (argSnippets ?? []).map((s) => {
      const type = concretize(s.dataType as AnyData);
      const ptrParams = s.ref in refSpaceToPtrParams
        ? refSpaceToPtrParams[s.ref as keyof typeof refSpaceToPtrParams]
        : undefined;

      return ptrParams !== undefined && !isPtr(type)
        ? INTERNAL_createPtr(
          ptrParams.space,
          type as StorableData,
          ptrParams.access,
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

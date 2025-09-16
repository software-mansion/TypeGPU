import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import { getMetaData } from '../shared/meta.ts';
import { concretize } from './generationHelpers.ts';

interface ShelllessVariant {
  argTypes: AnyData[];
  value: ShelllessImpl;
}

type AnyFn = (...args: never[]) => unknown;

export class ShelllessRepository {
  cache = new Map<AnyFn, ShelllessVariant[]>();

  get(fn: AnyFn, argSnippets: Snippet[]): ShelllessImpl | undefined {
    const meta = getMetaData(fn);
    if (!meta?.ast) return undefined;

    const argTypes = argSnippets.map((s) => concretize(s.dataType as AnyData));

    let cache = this.cache.get(fn);
    if (cache) {
      const variant = cache.find((v) =>
        v.argTypes.every((t, i) => t === argTypes[i])
      );
      if (variant) return variant.value;
    } else {
      cache = [];
      this.cache.set(fn, cache);
    }

    const shellless = createShelllessImpl(argTypes, fn);
    cache.push({ argTypes, value: shellless });
    return shellless;
  }
}

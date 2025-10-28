import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import { getMetaData, getName } from '../shared/meta.ts';
import { concretize } from './generationHelpers.ts';

interface ShelllessVariant {
  argTypes: AnyData[];
  value: ShelllessImpl;
}

type AnyFn = (...args: never[]) => unknown;

export class ShelllessRepository {
  cache = new Map<AnyFn, ShelllessVariant[]>();

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

    const argTypes = (argSnippets ?? []).map((s) =>
      concretize(s.dataType as AnyData)
    );

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

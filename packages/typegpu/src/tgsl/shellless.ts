import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import { getMetaData } from '../shared/meta.ts';

export class ShelllessRepository {
  get(
    fn: (...args: never[]) => unknown,
    argSnippets: Snippet[],
  ): ShelllessImpl | undefined {
    const meta = getMetaData(fn);
    if (!meta) return undefined;

    const argTypes = argSnippets.map((s) => s.dataType) as AnyData[];

    // TODO: Cache shell-less implementations
    const shellless = createShelllessImpl(argTypes, fn);
    return shellless;
  }
}

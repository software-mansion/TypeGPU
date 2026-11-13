import { FuncParameterType } from 'tinyest';
import { createShelllessImpl, type ShelllessImpl } from '../core/function/shelllessImpl.ts';
import { type AnyData, UnknownData } from '../data/dataTypes.ts';
import { schemasEqualNominally } from '../data/schemasEqual.ts';
import type { Snippet } from '../data/snippet.ts';
import { isPtr, isVoid, Void } from '../data/wgslTypes.ts';
import { getFunctionMetadata, getName } from '../shared/meta.ts';
import { concretize } from './generationHelpers.ts';
import { stringifySnippet } from './stringifySnippet.ts';

type AnyFn = (...args: never[]) => unknown;

export class ShelllessRepository {
  cache = new Map<AnyFn, ShelllessImpl[]>();

  get(fn: AnyFn, argSnippets: readonly Snippet[] | undefined): ShelllessImpl | undefined {
    const meta = getFunctionMetadata(fn);
    if (!meta) {
      return undefined;
    }
    const { params } = meta.ast;

    // Resolving directly means omitting every argument, which is only allowed when every param has
    // a default value. TypeScript annotations are not available at this point, so params that are
    // only marked as optional (`t?: number`) are indistinguishable from required ones.
    if (!argSnippets) {
      const required = params.find(
        (param) => param.type !== FuncParameterType.identifier || param.default === undefined,
      );
      if (required) {
        const reason =
          required.type === FuncParameterType.identifier
            ? `parameter '${required.name}' has no default value. Give it one ('${required.name} = undefined' if it's optional), call`
            : `it has a destructured parameter, which cannot be omitted. Call`;
        throw new Error(
          `Cannot resolve '${getName(fn)}' directly, because ${reason} it from another function, or wrap it in a shell`,
        );
      }
    }

    const argTypes = (argSnippets ?? []).map((s, index) => {
      if (s.value === undefined) {
        if (params[index]?.type !== FuncParameterType.identifier) {
          throw new Error(
            `Passed undefined as the #${index} argument to ${getName(fn) ?? '<unnamed>'}(...), but only identifier parameters can be omitted.`,
          );
        }
        // Omitted, the parameter's default value (or `undefined`) is used instead
        return Void;
      }

      if (s.dataType === UnknownData) {
        const snippetStr = stringifySnippet(s);
        const valueStr = String(s.value as unknown);
        const description =
          snippetStr === valueStr ? `'${snippetStr}'` : `'${snippetStr}' (${valueStr})`;
        throw new Error(
          `Passed illegal value ${description} as the #${index} argument to ${getName(fn) ?? '<unnamed>'}(...)\n` +
            `Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.\n` +
            `Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.`,
        );
      }

      let type = concretize(s.dataType);

      if (isPtr(type) && type.implicit) {
        // If the pointer was made implicitly (e.g. by assigning a reference to a const variable),
        // then we dereference the pointer before passing it to the function. The main reason for this,
        // is that in TypeScript, the type of the function accepts a value, not the value wrapped in
        // d.ref<> (so it's not considered mutable from the perspective of the function)

        // Example:
        // const foo = layout.$.boids;
        // bar(foo)
        //     ^^^
        type = type.inner;
      }

      return type;
    });

    // `fn(a, undefined)` is equivalent to `fn(a)`
    while (argTypes.length > 0 && isVoid(argTypes.at(-1))) {
      argTypes.pop();
    }

    let cache = this.cache.get(fn);
    if (cache) {
      const variant = cache.find(
        (v) =>
          v.argTypes.length === argTypes.length &&
          v.argTypes.every((t, i) => schemasEqualNominally(t as AnyData, argTypes[i] as AnyData)),
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

import {
  createShelllessImpl,
  type ShelllessImpl,
} from '../core/function/shelllessImpl.ts';
import type { AnyData } from '../data/dataTypes.ts';
import { RefOperator } from '../data/ref.ts';
import type { Snippet } from '../data/snippet.ts';
import { isPtr } from '../data/wgslTypes.ts';
import { WgslTypeError } from '../errors.ts';
import { getResolutionCtx } from '../execMode.ts';
import { getMetaData, getName } from '../shared/meta.ts';
import { concretize } from './generationHelpers.ts';

type AnyFn = (...args: never[]) => unknown;

function shallowEqualSchemas(a: AnyData, b: AnyData): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'ptr' && b.type === 'ptr') {
    return a.access === b.access &&
      a.addressSpace === b.addressSpace &&
      a.implicit === b.implicit &&
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

    const argTypes = (argSnippets ?? []).map((s, index) => {
      if (s.value instanceof RefOperator) {
        if (s.dataType.type === 'unknown') {
          throw new WgslTypeError(
            `d.ref() created with primitive types must be stored in a variable before use`,
          );
        }
        return s.dataType;
      }

      if (s.dataType.type === 'unknown') {
        throw new Error(
          `Passed illegal value ${s.value} as the #${index} argument to ${meta.name}(...)`,
        );
      }

      let type = concretize(s.dataType as AnyData);

      if (s.origin === 'constant-ref') {
        // biome-ignore lint/style/noNonNullAssertion: it's there
        const ctx = getResolutionCtx()!;
        throw new Error(
          `Cannot pass constant references as function arguments. Explicitly copy them by wrapping them in a schema: '${
            ctx.resolve(type).value
          }(...)'`,
        );
      }

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

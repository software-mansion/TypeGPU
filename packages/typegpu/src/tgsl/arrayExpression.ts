import { isStoredInMemory } from '../data/snippet.ts';
import type { ResolvedSnippet, Snippet } from '../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  isNaturallyEphemeral,
  type WgslArray,
} from '../data/wgslTypes.ts';
import { WgslTypeError } from '../errors.ts';
import { $comptimeValueOf, $internal, $resolve } from '../shared/symbols.ts';
import {
  asComptime,
  type ComptimeValue,
  type ResolutionCtx,
  type SelfResolvable,
  type WithComptimeValue,
} from '../types.ts';
import { stringifySnippet } from './stringifySnippet.ts';

export class ArrayExpression implements SelfResolvable, WithComptimeValue {
  readonly [$internal] = true;
  readonly type: WgslArray<AnyWgslData>;
  readonly elements: Snippet[];

  constructor(type: WgslArray<AnyWgslData>, elements: Snippet[]) {
    this.type = type;
    this.elements = elements;
  }

  toString(): string {
    return 'ArrayExpression';
  }

  [$comptimeValueOf](): ComptimeValue {
    // The array is known at comptime only if every element is known at comptime
    const values: unknown[] = [];
    for (const elem of this.elements) {
      const known = asComptime(elem);
      if (!known) {
        return { comptime: false };
      }
      values.push(known.value);
    }
    return { comptime: true, value: values };
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    for (const elem of this.elements) {
      // We check if there are no references among the elements
      if (isStoredInMemory(elem) && !isNaturallyEphemeral(elem.dataType)) {
        const snippetStr = stringifySnippet(elem);
        const snippetType = ctx.resolve(elem.dataType as BaseData).value;
        throw new WgslTypeError(
          `'${snippetStr}' reference cannot be used in an array constructor.\n-----\nTry '${snippetType}(${snippetStr})' or 'arrayOf(${snippetType}, count)([...])' to copy the value instead.\n-----`,
        );
      }
    }

    return ctx.gen.typeInstantiation(this.type, this.elements);
  }
}

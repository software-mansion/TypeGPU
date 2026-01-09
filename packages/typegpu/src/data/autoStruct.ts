import { IOData } from '../core/function/fnTypes.ts';
import { createIoSchema } from '../core/function/ioSchema.ts';
import { getName } from '../shared/meta.ts';
import { $internal, $resolve } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import type { AnyData } from './dataTypes.ts';
import { type ResolvedSnippet, snip } from './snippet.ts';

export class AutoStruct implements SelfResolvable {
  // Prototype properties
  declare [$internal]: true;
  declare type: 'auto-struct';

  /**
   * JS key -> data type
   */
  readonly validProps: Record<string, AnyData>;
  /**
   * JS key -> WGSL key
   * @example '$position' -> 'position'
   */
  readonly remapped: Record<string, string>;

  #locations: Record<string, number> | undefined;

  constructor(
    validProps: Record<string, AnyData>,
    locations?: Record<string, number> | undefined,
  ) {
    this.validProps = validProps;
    this.remapped = {};
    this.#locations = locations;
  }

  accessProp(target: unknown, key: string): ResolvedSnippet | undefined {
    const dataType = this.validProps[key];
    if (!dataType) {
      return undefined;
    }

    let wgslKey = this.remapped[key];
    if (!wgslKey) {
      if (key.includes('$')) {
        // Find a unique key
        wgslKey = key.replace('$', ''); // Starting with the original key without '$' (identity for non-builtins)
        let idx = 1;
        while (wgslKey in this.validProps) {
          wgslKey = `${key}_${++idx}`;
        }
      } else {
        wgslKey = key;
      }
      this.remapped[key] = wgslKey;
    }

    return snip(`${target}.${wgslKey}`, dataType, 'argument');
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const regularStruct = createIoSchema(
      Object.fromEntries(
        Object.entries(this.remapped).map(([jsKey, wgslKey]) => {
          return [wgslKey, this.validProps[jsKey]] as [string, IOData];
        }),
      ),
      this.#locations,
    );

    return ctx.resolve(regularStruct);
  }

  toString(): string {
    return `auto-struct:${getName(this) ?? '<unnamed>'}`;
  }
}

AutoStruct.prototype[$internal] = true;
AutoStruct.prototype.type = 'auto-struct';

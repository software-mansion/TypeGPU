import type { IOData } from '../core/function/fnTypes.ts';
import { createIoSchema } from '../core/function/ioSchema.ts';
import { getName } from '../shared/meta.ts';
import { $internal, $resolve } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import type { AnyData } from './dataTypes.ts';
import type { ResolvedSnippet } from './snippet.ts';
import type { WgslStruct } from './wgslTypes.ts';

/**
 * A requirement for the generated struct is that non-builtin properties need to
 * have the same name in WGSL as they do in JS. This allows locations to be properly
 * matched between the Vertex output and Fragment input.
 */
export class AutoStruct implements SelfResolvable {
  // Prototype properties
  declare [$internal]: true;
  declare type: 'auto-struct';

  /**
   * JS key -> data type
   */
  readonly #validProps: Record<string, AnyData>;
  /**
   * JS key -> WGSL key
   * @example '$position' -> 'position'
   */
  readonly #remapped: Record<string, string>;

  #usedWgslKeys: Set<string>;
  #locations: Record<string, number> | undefined;
  #cachedStruct: WgslStruct | undefined;
  #typeForExtraProps: AnyData | undefined;

  constructor(
    validProps: Record<string, AnyData>,
    typeForExtraProps: AnyData | undefined,
    locations?: Record<string, number> | undefined,
  ) {
    this.#validProps = validProps;
    this.#typeForExtraProps = typeForExtraProps;
    this.#remapped = {};
    this.#locations = locations;
    this.#usedWgslKeys = new Set();
  }

  accessProp(key: string): [string, AnyData] | undefined {
    // If the prop is not found in validProps, we consider it an extra property
    const dataType = this.#validProps[key] ?? this.#typeForExtraProps;
    if (!dataType) {
      return undefined;
    }

    let wgslKey = this.#remapped[key];
    if (!wgslKey) {
      // Builtins always start with '$'
      if (key.includes('$')) {
        // Finding a unique key
        wgslKey = key.replace('$', ''); // Starting with the original key without '$' (identity for non-builtins)
        let idx = 1;
        while (wgslKey in this.#validProps && this.#usedWgslKeys.has(wgslKey)) {
          wgslKey = `${key}_${++idx}`;
        }
      } else {
        // Finding a unique key
        wgslKey = key;
        let idx = 1;
        while (this.#usedWgslKeys.has(wgslKey)) {
          wgslKey = `${key}_${++idx}`;
        }
      }
      this.#usedWgslKeys.add(wgslKey);
      this.#remapped[key] = wgslKey;
    }

    return [wgslKey, dataType];
  }

  get completeStruct() {
    if (!this.#cachedStruct) {
      this.#cachedStruct = createIoSchema(
        Object.fromEntries(
          Object.entries(this.#remapped).map(([jsKey, wgslKey]) => {
            return [
              wgslKey,
              this.#validProps[jsKey] ?? this.#typeForExtraProps,
            ] as [string, IOData];
          }),
        ),
        this.#locations,
      );
    }

    return this.#cachedStruct;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolve(this.completeStruct);
  }

  toString(): string {
    return `auto-struct:${getName(this) ?? '<unnamed>'}`;
  }
}

AutoStruct.prototype[$internal] = true;
AutoStruct.prototype.type = 'auto-struct';

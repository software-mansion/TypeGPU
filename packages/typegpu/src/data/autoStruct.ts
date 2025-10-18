import type { IOData } from '../core/function/fnTypes.ts';
import { createIoSchema } from '../core/function/ioSchema.ts';
import { getName, setName } from '../shared/meta.ts';
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
   * js key -> data type
   */
  readonly #validProps: Record<string, AnyData>;
  /**
   * js key -> { prop: 'wgsl key', type: ... }
   * @example '$position' -> { prop: 'position', type: ... }
   */
  readonly #allocated: Record<string, { prop: string; type: AnyData }>;

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
    this.#allocated = {};
    this.#locations = locations;
    this.#usedWgslKeys = new Set();
  }

  accessProp(key: string): { prop: string; type: AnyData } | undefined {
    // If the prop is not found in validProps, we consider it an extra property
    const dataType = this.#validProps[key] ?? this.#typeForExtraProps;
    if (!dataType) {
      return undefined;
    }

    return this.provideProp(key, dataType);
  }

  provideProp(key: string, dataType: AnyData): { prop: string; type: AnyData } {
    let alloc = this.#allocated[key];
    if (!alloc) {
      let wgslKey = key;
      // Builtins always start with '$'
      if (wgslKey.includes('$')) {
        // Finding a unique key
        wgslKey = key.replace('$', ''); // Starting with the original key without '$' (identity for non-builtins)
        let idx = 1;
        while (wgslKey in this.#validProps && this.#usedWgslKeys.has(wgslKey)) {
          wgslKey = `${key}_${++idx}`;
        }
      } else {
        // Finding a unique key
        let idx = 1;
        while (this.#usedWgslKeys.has(wgslKey)) {
          wgslKey = `${key}_${++idx}`;
        }
      }
      this.#usedWgslKeys.add(wgslKey);
      alloc = { prop: wgslKey, type: dataType };
      this.#allocated[key] = alloc;
    }

    return alloc;
  }

  get completeStruct() {
    if (!this.#cachedStruct) {
      this.#cachedStruct = createIoSchema(
        Object.fromEntries(
          Object.entries(this.#allocated).map(([key, alloc]) => {
            return [alloc.prop, alloc.type] as [string, IOData];
          }),
        ),
        this.#locations,
      );
      const ownName = getName(this);
      // Passing the given name forward
      if (ownName) {
        setName(this.#cachedStruct, ownName);
      }
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

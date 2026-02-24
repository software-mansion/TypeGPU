import { createIoSchema } from '../core/function/ioSchema.ts';
import { isValidProp } from '../nameRegistry.ts';
import { getName, setName } from '../shared/meta.ts';
import { $internal, $repr, $resolve } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import type { ResolvedSnippet } from './snippet.ts';
import type { BaseData, WgslStruct } from './wgslTypes.ts';

/**
 * A requirement for the generated struct is that non-builtin properties need to
 * have the same name in WGSL as they do in JS. This allows locations to be properly
 * matched between the Vertex output and Fragment input.
 */
export class AutoStruct implements BaseData, SelfResolvable {
  // Prototype properties
  declare [$internal]: Record<string, never>;
  declare type: 'auto-struct';

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Record<string, unknown>;
  // ---

  /**
   * js key -> data type
   */
  readonly #validProps: Record<string, BaseData>;
  /**
   * js key -> { prop: 'wgsl key', type: ... }
   * @example '$position' -> { prop: 'position', type: ... }
   */
  readonly #allocated: Record<string, { prop: string; type: BaseData }>;

  #usedWgslKeys: Set<string>;
  #locations: Record<string, number> | undefined;
  #cachedStruct: WgslStruct | undefined;
  #typeForExtraProps: BaseData | undefined;

  constructor(
    validProps: Record<string, BaseData>,
    typeForExtraProps: BaseData | undefined,
    locations?: Record<string, number>,
  ) {
    this.#validProps = validProps;
    this.#typeForExtraProps = typeForExtraProps;
    this.#allocated = {};
    this.#locations = locations;
    this.#usedWgslKeys = new Set();
  }

  /**
   * Used for accessing builtins, varying and attributes in code.
   */
  accessProp(key: string): { prop: string; type: BaseData } | undefined {
    // If the prop is not found in validProps, we consider it an extra property
    const dataType = this.#validProps[key] ?? this.#typeForExtraProps;
    if (!dataType) {
      return undefined;
    }

    return this.provideProp(key, dataType);
  }

  /**
   * Used for providing new varyings.
   *
   * @privateRemarks
   * Internally used by `accessProp`.
   */
  provideProp(
    key: string,
    dataType: BaseData,
  ): { prop: string; type: BaseData } {
    let alloc = this.#allocated[key];
    if (!alloc) {
      const wgslKey = key.replaceAll('$', '');
      if (this.#usedWgslKeys.has(wgslKey)) {
        throw new Error(
          `Property name '${wgslKey}' causes naming clashes. Choose a different name.`,
        );
      }
      if (!isValidProp(wgslKey)) {
        throw new Error(
          `Property key '${key}' is a reserved WGSL word. Choose a different name.`,
        );
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
          Object.values(this.#allocated).map((alloc) => {
            return [alloc.prop, alloc.type];
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

AutoStruct.prototype[$internal] = {};
AutoStruct.prototype.type = 'auto-struct';

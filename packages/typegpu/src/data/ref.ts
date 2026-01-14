import { stitch } from '../core/resolve/stitch.ts';
import { WgslTypeError } from '../errors.ts';
import { inCodegenMode } from '../execMode.ts';
import { setName } from '../shared/meta.ts';
import { $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import { UnknownData } from './dataTypes.ts';
import type { DualFn } from './dualFn.ts';
import { createPtrFromOrigin, explicitFrom } from './ptr.ts';
import { type ResolvedSnippet, snip, type Snippet } from './snippet.ts';
import {
  isNaturallyEphemeral,
  isPtr,
  type Ptr,
  type StorableData,
} from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * A reference to a value `T`. Can be passed to other functions to give them
 * mutable access to the underlying value.
 *
 * Conceptually, it represents a WGSL pointer.
 */
export interface ref<T> {
  readonly [$internal]: unknown;
  readonly type: 'ref';

  /**
   * Derefences the reference, and gives access to the underlying value.
   *
   * @example ```ts
   * const boid = Boid({ pos: d.vec3f(3, 2, 1) });
   * const posRef = d.ref(boid.pos);
   *
   * // Actually updates `boid.pos`
   * posRef.$ = d.vec3f(1, 2, 3);
   * console.log(boid.pos); // Output: vec3f(1, 2, 3)
   * ```
   */
  $: T;
}

// biome has issues with this type being inline
type RefFn = <T>(value: T) => ref<T>;

export const ref = (() => {
  const gpuImpl = (value: Snippet) => {
    if (value.origin === 'argument') {
      throw new WgslTypeError(
        stitch`d.ref(${value}) is illegal, cannot take a reference of an argument. Copy the value locally first, and take a reference of the copy.`,
      );
    }

    if (value.dataType.type === 'ptr') {
      // This can happen if we take a reference of an *implicit* pointer, one
      // made by assigning a reference to a `const`.
      return snip(value.value, explicitFrom(value.dataType), value.origin);
    }

    /**
     * Pointer type only exists if the ref was created from a reference (buttery-butter).
     *
     * @example
     * ```ts
     * const life = ref(42); // created from a value
     * const boid = ref(layout.$.boids[0]); // created from a reference
     * ```
     */
    const ptrType = createPtrFromOrigin(
      value.origin,
      value.dataType as StorableData,
    );
    return snip(
      new RefOperator(value, ptrType),
      ptrType ?? UnknownData,
      /* origin */ 'runtime',
    );
  };

  const jsImpl = <T>(value: T) => new refImpl(value);

  const impl = <T>(value: T) => {
    if (inCodegenMode()) {
      return gpuImpl(value as Snippet);
    }
    return jsImpl(value);
  };

  setName(impl, 'ref');
  impl.toString = () => 'ref';
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl,
      gpuImpl,
      strictSignature: undefined,
      argConversionHint: 'keep',
    },
  });

  return impl as unknown as DualFn<RefFn>;
})();

export function isRef<T>(value: unknown | ref<T>): value is ref<T> {
  return value instanceof refImpl;
}

// --------------
// Implementation
// --------------

class refImpl<T> implements ref<T> {
  readonly [$internal]: true;
  readonly type: 'ref';
  #value: T;

  constructor(value: T) {
    this[$internal] = true;
    this.type = 'ref';
    this.#value = value;
  }

  get $(): T {
    return this.#value as T;
  }

  set $(value: T) {
    if (value && typeof value === 'object') {
      // Setting an object means updating the properties of the original object.
      // e.g.: foo.$ = Boid();
      for (const key of Object.keys(value) as (keyof T)[]) {
        this.#value[key] = value[key];
      }
    } else {
      this.#value = value;
    }
  }
}

/**
 * The result of calling `d.ref(...)`. The code responsible for
 * generating shader code can check if the value of a snippet is
 * an instance of `RefOperator`, and act accordingly.
 */
export class RefOperator implements SelfResolvable {
  readonly [$internal]: true;
  readonly snippet: Snippet;

  readonly #ptrType: Ptr | undefined;

  constructor(snippet: Snippet, ptrType: Ptr | undefined) {
    this[$internal] = true;
    this.snippet = snippet;
    this.#ptrType = ptrType;
  }

  get [$ownSnippet](): Snippet {
    if (!this.#ptrType) {
      throw new Error(stitch`Cannot take a reference of ${this.snippet}`);
    }
    return snip(this, this.#ptrType, this.snippet.origin);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    if (!this.#ptrType) {
      throw new Error(stitch`Cannot take a reference of ${this.snippet}`);
    }
    return snip(stitch`(&${this.snippet})`, this.#ptrType, this.snippet.origin);
  }
}

export function derefSnippet(snippet: Snippet): Snippet {
  if (!isPtr(snippet.dataType)) {
    return snippet;
  }

  const innerType = snippet.dataType.inner;
  const origin = isNaturallyEphemeral(innerType) ? 'runtime' : snippet.origin;

  if (snippet.value instanceof RefOperator) {
    return snip(stitch`${snippet.value.snippet}`, innerType, origin);
  }

  return snip(stitch`(*${snippet})`, innerType, origin);
}

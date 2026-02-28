import { stitch } from '../core/resolve/stitch.ts';
import { WgslTypeError } from '../errors.ts';
import { setName } from '../shared/meta.ts';
import { $gpuCallable, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import type { DualFn, SelfResolvable } from '../types.ts';
import { UnknownData } from './dataTypes.ts';
import { createPtrFromOrigin, explicitFrom } from './ptr.ts';
import { type ResolvedSnippet, snip, type Snippet } from './snippet.ts';
import { isNaturallyEphemeral, isPtr, type Ptr, type StorableData } from './wgslTypes.ts';

// ----------
// Public API
// ----------

interface ref<T> {
  readonly [$internal]: { type: 'ref' };

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

/**
 * A reference to a value `T`. Can be passed to other functions to give them
 * mutable access to the underlying value.
 *
 * Conceptually, it represents a WGSL pointer.
 */
export type _ref<T> = T extends object ? T & ref<T> : ref<T>;

type RefFn = DualFn<<T>(value: T) => _ref<T>> & { [$internal]: true };

export const _ref = (() => {
  const impl = (<T>(value: T) => INTERNAL_createRef(value)) as unknown as RefFn;

  setName(impl, 'ref');
  impl.toString = () => 'ref';
  impl[$internal] = true;
  impl[$gpuCallable] = {
    call(_ctx, [value]) {
      if (value.origin === 'argument') {
        throw new WgslTypeError(
          stitch`d.ref(${value}) is illegal, cannot take a reference of an argument. Copy the value locally first, and take a reference of the copy.`,
        );
      }

      if (isPtr(value.dataType)) {
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
      const ptrType = createPtrFromOrigin(value.origin, value.dataType as StorableData);
      return snip(new RefOperator(value, ptrType), ptrType ?? UnknownData, /* origin */ 'runtime');
    },
  };

  return impl;
})();

export function isRef<T>(value: unknown): value is ref<T> {
  return (value as ref<T>)?.[$internal]?.type === 'ref';
}

// --------------
// Implementation
// --------------

export function INTERNAL_createRef<T>(value: T): ref<T> {
  const target = {
    [$internal]: { type: 'ref' },

    get $(): T {
      return value;
    },

    set $(newValue: T) {
      if (newValue && typeof newValue === 'object') {
        // Setting an object means updating the properties of the original object.
        // e.g.: foo.$ = Boid();
        for (const key of Object.keys(newValue) as (keyof T)[]) {
          value[key] = newValue[key];
        }
      } else {
        value = newValue;
      }
    },
  };

  if (value === undefined || value === null) {
    throw new Error('Cannot create a ref from undefined or null');
  }

  if (typeof value === 'object') {
    return new Proxy(target, {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        return value[prop as keyof T];
      },
      set(_target, prop, propValue) {
        if (prop === $internal) {
          return false;
        }
        if (prop === '$') {
          console.log('Setting ref value:', propValue);
          return Reflect.set(target, prop, propValue);
        }
        return Reflect.set(value as object, prop, propValue);
      },
    }) as ref<T>;
  }

  return target as ref<T>;
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

  [$resolve](): ResolvedSnippet {
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

import { stitch } from '../core/resolve/stitch.ts';
import { concretize } from '../tgsl/generationHelpers.ts';
import { stringifySnippet } from '../tgsl/stringifySnippet.ts';
import { WgslTypeError } from '../errors.ts';
import { setName } from '../shared/meta.ts';
import { $gpuCallable, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import type { DualFn, SelfResolvable } from '../types.ts';
import { UnknownData } from './dataTypes.ts';
import { createPtrFromOrigin, explicitFrom, ptrFn } from './ptr.ts';
import { isAlias, type ResolvedSnippet, snip, type Snippet, withDataType } from './snippet.ts';
import { isNaturallyEphemeral, isPtr, isVoid, type Ptr, type StorableData } from './wgslTypes.ts';

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
    call(ctx, [value]) {
      if (value.origin === 'argument') {
        throw new WgslTypeError(
          `d.ref(${stringifySnippet(value)}) is illegal, cannot take a reference of an argument. Copy the value first, and take a reference of the copy.`,
        );
      }

      if (value.origin === 'constant-immutable-def' || value.origin === 'runtime-immutable-def') {
        const typeStr = ctx.resolve(value.dataType).value;
        throw new WgslTypeError(
          `d.ref(${stringifySnippet(value)}) is illegal, cannot take a reference to a constant.
-----
- Try 'd.ref(${typeStr}(${stringifySnippet(value)}));' instead to create a new referencable value.
-----`,
        );
      }

      if (isAlias(value) && isNaturallyEphemeral(value.dataType)) {
        const typeStr = ctx.resolve(value.dataType).value;
        throw new WgslTypeError(
          `d.ref(${stringifySnippet(value)}) is illegal, cannot take a reference to a scalar value.
-----
- Try 'd.ref(${typeStr}(${stringifySnippet(value)}));' instead to create a new referencable scalar.
-----`,
        );
      }

      if (isPtr(value.dataType)) {
        // This can happen if we take a reference of an *implicit* pointer, one
        // made by assigning a reference to a `const`.
        return withDataType(explicitFrom(value.dataType), value);
      }

      if (value.dataType === UnknownData || isVoid(value.dataType)) {
        throw new WgslTypeError(
          `d.ref(${stringifySnippet(value)}) is illegal, cannot determine the WGSL type of '${stringifySnippet(value)}'.`,
        );
      }

      /**
       * The value is addressable only if the ref was created from a reference (buttery-butter).
       *
       * @example
       * ```ts
       * const life = ref(42); // created from a value, has to be stored in a variable
       * const boid = ref(layout.$.boids[0]); // created from a reference
       * ```
       */
      const addressablePtrType = createPtrFromOrigin(value.origin, value.dataType as StorableData);
      // Values that are not addressable become addressable once stored in a
      // function-scope variable (`const life = d.ref(42)`), so that's the type they get.
      const ptrType = addressablePtrType ?? ptrFn(concretize(value.dataType as StorableData));

      return snip(
        new RefOperator(value, ptrType, /* addressable */ addressablePtrType !== undefined),
        ptrType,
        /* origin */ 'runtime',
        value.possibleSideEffects,
      );
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
  readonly ptrType: Ptr;
  /**
   * Whether `snippet` refers to an existing value in memory. If not (e.g. `d.ref(42)`),
   * the ref has to be stored in a variable (`const life = d.ref(42)`) before it can be used.
   */
  readonly addressable: boolean;

  constructor(snippet: Snippet, ptrType: Ptr, addressable: boolean) {
    this[$internal] = true;
    this.snippet = snippet;
    this.ptrType = ptrType;
    this.addressable = addressable;
  }

  get [$ownSnippet](): Snippet {
    return snip(this, this.ptrType, this.snippet.origin, this.snippet.possibleSideEffects);
  }

  toString(): string {
    return `d.ref(${stringifySnippet(this.snippet)})`;
  }

  [$resolve](): ResolvedSnippet {
    if (!this.addressable) {
      const valueStr = stringifySnippet(this.snippet);
      throw new WgslTypeError(
        `d.ref(${valueStr}) has to be stored in a variable before use, since '${valueStr}' is not an existing value that can be referenced.
-----
- Try 'const ref = d.ref(${valueStr});', and use 'ref' instead.
-----`,
      );
    }
    return snip(
      stitch`(&${this.snippet})`,
      this.ptrType,
      this.snippet.origin,
      this.snippet.possibleSideEffects,
    );
  }
}

export function derefSnippet(snippet: Snippet): Snippet {
  if (!isPtr(snippet.dataType)) {
    return snippet;
  }

  const innerType = snippet.dataType.inner;

  if (snippet.value instanceof RefOperator) {
    // Dereferencing gives back the value the ref was created from, along with its origin.
    // For non-addressable refs (e.g. `d.ref(1)`), that makes the result a non-reference,
    // which in turn disallows mutating it (e.g. `d.ref(1).$ = 2`).
    const inner = snippet.value.snippet;
    return snip(stitch`${inner}`, innerType, inner.origin, snippet.possibleSideEffects);
  }

  return snip(stitch`(*${snippet})`, innerType, snippet.origin, snippet.possibleSideEffects);
}

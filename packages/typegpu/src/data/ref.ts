import { stitch } from '../core/resolve/stitch.ts';
import { invariant } from '../errors.ts';
import { inCodegenMode } from '../execMode.ts';
import { setName } from '../shared/meta.ts';
import { $internal, $isRef, $ownSnippet, $resolve } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';
import { UnknownData } from './dataTypes.ts';
import type { DualFn } from './dualFn.ts';
import { createPtrFromOrigin } from './ptr.ts';
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

export interface ref<T> {
  readonly [$internal]: unknown;
  readonly [$isRef]: true;

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

// TODO: Restrict calls to this function only from within TypeGPU functions
export const ref: DualFn<<T>(value: T) => ref<T>> = (() => {
  const gpuImpl = (value: Snippet) => {
    return snip(new RefOnGPU(value), UnknownData, /* origin */ 'runtime');
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

  return impl as unknown as DualFn<<T>(value: T) => ref<T>>;
})();

// --------------
// Implementation
// --------------

class refImpl<T> implements ref<T> {
  #value: T;
  readonly [$internal]: true;
  readonly [$isRef]: true;

  constructor(value: T) {
    this.#value = value;
    this[$internal] = true;
    this[$isRef] = true;
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

export class RefOnGPU {
  readonly [$internal]: true;

  readonly snippet: Snippet;
  /**
   * Pointer params only exist if the ref was created from a reference (buttery-butter).
   */
  readonly ptrType: Ptr | undefined;

  constructor(snippet: Snippet) {
    this[$internal] = true;
    this.snippet = snippet;
    this.ptrType = createPtrFromOrigin(
      snippet.origin,
      snippet.dataType as StorableData,
    );
  }

  toString(): string {
    return `ref:${this.snippet.value}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    invariant(
      !!this.ptrType,
      'RefOnGPU must have a pointer type when resolved',
    );
    return snip(stitch`(&${this.snippet})`, this.ptrType, this.snippet.origin);
  }
}

export class RefOperator implements SelfResolvable {
  readonly [$internal]: true;
  readonly snippet: Snippet;
  readonly #ptrType: Ptr;

  constructor(snippet: Snippet) {
    this[$internal] = true;
    this.snippet = snippet;

    const ptrType = createPtrFromOrigin(
      snippet.origin,
      snippet.dataType as StorableData,
    );

    if (!ptrType) {
      throw new Error(
        `Cannot take a reference of a value with origin ${this.snippet.origin}`,
      );
    }

    this.#ptrType = ptrType;
  }

  get [$ownSnippet](): Snippet {
    return snip(this, this.#ptrType, this.snippet.origin);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return snip(stitch`(&${this.snippet})`, this.#ptrType, this.snippet.origin);
  }
}

export function derefSnippet(snippet: Snippet): Snippet {
  invariant(isPtr(snippet.dataType), 'Only pointers can be dereferenced');

  const innerType = snippet.dataType.inner;
  // Dereferencing a pointer does not return a copy of the value, it's still a reference.
  const origin = isNaturallyEphemeral(innerType) ? 'runtime' : snippet.origin;

  if (snippet.value instanceof RefOperator) {
    return snip(stitch`${snippet.value.snippet}`, innerType, origin);
  }

  return snip(stitch`(*${snippet})`, innerType, origin);
}

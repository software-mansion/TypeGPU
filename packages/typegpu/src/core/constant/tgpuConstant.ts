import { isData, type AnyData } from '../../data/dataTypes.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type AnyWgslData, type BaseData, type WgslArray } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

type DeepReadonly<T> = T extends { [$internal]: unknown }
  ? T
  : T extends unknown[]
    ? ReadonlyArray<DeepReadonly<T[number]>>
    : T extends Record<string, unknown>
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface TgpuConst<TDataType extends BaseData = BaseData> extends TgpuNamable {
  readonly resourceType: 'const';
  readonly [$gpuValueOf]: DeepReadonly<InferGPU<TDataType>>;
  readonly $: DeepReadonly<InferGPU<TDataType>>;

  readonly [$internal]: {
    /** Makes it differentiable on the type level. Does not exist at runtime. */
    dataType?: TDataType;
  };
}

/**
 * Creates a module constant with specified value.
 */
export function constant<TDataType extends AnyData>(
  dataType: TDataType,
  value: InferGPU<TDataType>,
): TgpuConst<TDataType>;

export function constant<TElement extends AnyWgslData>(
  dataType: (elementCount: number) => WgslArray<TElement>,
  value: InferGPU<WgslArray<TElement>>,
): TgpuConst<WgslArray<TElement>>;

export function constant(
  dataType: AnyData | ((elementCount: number) => WgslArray),
  value: InferGPU<AnyData>,
): TgpuConst {
  if (!isData(dataType)) {
    if (!Array.isArray(value)) {
      throw new Error(
        `Expected an array value for a partially-applied array schema, but received: ${typeof value}.`,
      );
    }
    return new TgpuConstImpl(dataType(value.length), value);
  }

  return new TgpuConstImpl(dataType, value);
}

export function isConst(value: unknown): value is TgpuConst {
  return (
    (value as TgpuConst | undefined)?.resourceType === 'const' &&
    !!(value as { [$internal]?: unknown } | undefined)?.[$internal]
  );
}

// --------------
// Implementation
// --------------

function deepFreeze<T extends object>(object: T): T {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    // oxlint-disable-next-line typescript/no-explicit-any -- chill TypeScript
    const value = (object as any)[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

class TgpuConstImpl<TDataType extends BaseData> implements TgpuConst<TDataType>, SelfResolvable {
  readonly [$internal] = {};
  readonly resourceType: 'const';
  readonly dataType: TDataType;

  readonly #value: DeepReadonly<InferGPU<TDataType>>;

  constructor(dataType: TDataType, value: InferGPU<TDataType>) {
    this.resourceType = 'const';
    this.dataType = dataType;
    this.#value =
      value && typeof value === 'object'
        ? (deepFreeze(value) as DeepReadonly<InferGPU<TDataType>>)
        : (value as DeepReadonly<InferGPU<TDataType>>);
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');

    return ctx.gen.declareGlobalConst({
      id,
      dataType: this.dataType,
      init: snip(this.#value, this.dataType, 'constant'),
    });
  }

  toString() {
    return `const:${getName(this) ?? '<unnamed>'}`;
  }

  get [$gpuValueOf](): DeepReadonly<InferGPU<TDataType>> {
    const dataType = this.dataType;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, dataType, 'constant-immutable-def', /* possibleSideEffects */ false);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `const:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as DeepReadonly<InferGPU<TDataType>>;
  }

  get $(): DeepReadonly<InferGPU<TDataType>> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    return this.#value;
  }
}

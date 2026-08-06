import { isData, type AnyData } from '../../data/dataTypes.ts';
import { snip } from '../../data/snippet.ts';
import { type AnyWgslData, type BaseData, type WgslArray } from '../../data/wgslTypes.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal } from '../../shared/symbols.ts';

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

class TgpuConstImpl<TDataType extends BaseData> implements TgpuConst<TDataType> {
  readonly dataType: TDataType;
  readonly #value: DeepReadonly<InferGPU<TDataType>>;

  // prototype properties
  declare [$internal]: {};
  declare resourceType: 'const';
  declare readonly [$gpuValueOf]: DeepReadonly<InferGPU<TDataType>>;
  declare readonly $: DeepReadonly<InferGPU<TDataType>>;

  static {
    TgpuConstImpl.prototype[$internal] = {};
    TgpuConstImpl.prototype.resourceType = 'const';

    makeDereferenceable(
      makeResolvable(TgpuConstImpl.prototype, {
        asString() {
          return `const:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');

          return ctx.gen.declareGlobalConst({
            id,
            dataType: this.dataType,
            init: snip(this.#value, this.dataType, 'constant'),
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this.dataType,
              'constant-immutable-def',
              /* possibleSideEffects */ false,
            );
          },
        },
        normalMode: {
          get() {
            return this.#value;
          },
        },
      },
    );
  }

  constructor(dataType: TDataType, value: InferGPU<TDataType>) {
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
}

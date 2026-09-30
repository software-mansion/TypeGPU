import { snip } from '../../data/snippet.ts';
import {
  type BaseData,
  type Bool,
  type F16,
  type F32,
  type I32,
  type U32,
} from '../../data/wgslTypes.ts';
import { IllegalVarAccessError, MissingOverridesError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $gpuValueOf, $internal, $soul, isMarkedInternal } from '../../shared/symbols.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';

// ----------
// Public API
// ----------

export type OverrideData = Bool | F32 | F16 | I32 | U32;

export interface TgpuOverrideSoul<
  TDataType extends BaseData = BaseData,
> extends TgpuSoul<'override'> {
  readonly dataType: TDataType;
  readonly defaultValue: InferGPU<TDataType> | undefined;
}

export interface TgpuOverride<TDataType extends BaseData = BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly [$soul]: TgpuOverrideSoul<TDataType>;
  readonly resourceType: 'override';
  readonly dataType: TDataType;
  readonly defaultValue: InferGPU<TDataType> | undefined;
  readonly [$gpuValueOf]: InferGPU<TDataType>;
  readonly $: InferGPU<TDataType>;
}

/**
 * Defines a pipeline-overridable constant (a WGSL `override` declaration). Its value is
 * fixed for the lifetime of a pipeline, but can differ between pipelines sharing the same
 * shader code, letting the shader compiler specialize the code for each value.
 *
 * Values are provided with `pipeline.with(override, value)`. Every distinct combination of
 * values used with a pipeline compiles (and caches) a separate GPU pipeline, while the
 * shader module is shared between them.
 *
 * @param dataType The schema of the held value. Can only be a scalar (bool, f32, f16, i32 or u32).
 * @param defaultValue The value used when none is provided through `pipeline.with(override, value)`.
 *                     Emitted into the shader as the declaration's initializer.
 *
 * @example
 * ```ts
 * const useFog = tgpu['~unstable'].override(d.bool, false);
 *
 * const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
 *   'use gpu';
 *   if (useFog.$) {
 *     // ...
 *   }
 * });
 *
 * const pipeline = root.createRenderPipeline({ vertex, fragment });
 * const foggyPipeline = pipeline.with(useFog, true);
 * ```
 */
export function override<TDataType extends OverrideData>(
  dataType: TDataType,
  defaultValue?: InferGPU<TDataType>,
): TgpuOverride<TDataType> {
  if (!OVERRIDE_TYPES.has(dataType.type)) {
    throw new Error(
      `Invalid schema '${dataType.type}' for override: overrides can only hold scalars (bool, f32, f16, i32 or u32)`,
    );
  }
  if (defaultValue !== undefined) {
    validateOverrideValue(dataType, defaultValue, '<unnamed>');
  }
  return new TgpuOverrideImpl(dataType, defaultValue);
}

export function isOverride(value: unknown): value is TgpuOverride {
  return (value as TgpuOverride)?.resourceType === 'override' && isMarkedInternal(value);
}

// --------------
// Implementation
// --------------

const OVERRIDE_TYPES = new Set(['bool', 'f32', 'f16', 'i32', 'u32']);

const INTEGER_RANGES: Record<string, [number, number]> = {
  i32: [-(2 ** 31), 2 ** 31 - 1],
  u32: [0, 2 ** 32 - 1],
};

export type OverrideValue = number | boolean;

function validateOverrideValue(dataType: BaseData, value: unknown, name: string): void {
  if (dataType.type === 'bool') {
    if (typeof value !== 'boolean') {
      throw new Error(`Expected a boolean value for override '${name}', got: ${String(value)}`);
    }
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Expected a finite number for override '${name}' of type '${dataType.type}', got: ${String(value)}`,
    );
  }

  const range = INTEGER_RANGES[dataType.type];
  if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) {
    throw new Error(
      `Value ${value} is not a valid '${dataType.type}' for override '${name}', expected an integer in range [${range[0]}, ${range[1]}]`,
    );
  }
}

/**
 * Validates a value provided for an override, e.g. through `pipeline.with(override, value)`.
 */
export function validateOverrideValueFor(override: TgpuOverride, value: unknown): OverrideValue {
  validateOverrideValue(override.dataType, value, getName(override) ?? '<unnamed>');
  return value as OverrideValue;
}

/**
 * Computes the `constants` record passed to a pipeline's programmable stages.
 *
 * @param usedOverrides The overrides used by the shader, mapped to their WGSL identifiers.
 * @param values Values provided for overrides, e.g. through `pipeline.with(override, value)`.
 *               Values for overrides the shader does not use are ignored.
 * @throws {MissingOverridesError} When a used override has neither a provided value nor a default.
 */
export function collectOverrideConstants(
  usedOverrides: ReadonlyMap<TgpuOverride, string>,
  values: ReadonlyMap<TgpuOverride, OverrideValue> | undefined,
): Record<string, number> {
  const constants: Record<string, number> = {};
  const missing: TgpuOverride[] = [];

  for (const [override, id] of usedOverrides) {
    const value = values?.get(override);
    if (value !== undefined) {
      constants[id] = Number(value);
    } else if (override.defaultValue === undefined) {
      missing.push(override);
    }
    // Otherwise the initializer in the shader is used.
  }

  if (missing.length > 0) {
    throw new MissingOverridesError(missing.map((o) => getName(o)));
  }

  return constants;
}

/** A stable cache key for GPU pipelines specialized with the given constants. */
export function overrideConstantsKey(constants: Record<string, number>): string {
  return Object.keys(constants)
    .toSorted()
    .map((id) => `${id}=${constants[id]}`)
    .join(';');
}

class TgpuOverrideImpl<TDataType extends BaseData> implements TgpuOverride<TDataType> {
  readonly [$soul]: TgpuOverrideSoul<TDataType>;

  // prototype properties
  declare readonly [$internal]: true;
  declare resourceType: 'override';
  declare readonly $: InferGPU<TDataType>;
  declare readonly [$gpuValueOf]: InferGPU<TDataType>;

  static {
    const prototype = TgpuOverrideImpl.prototype as TgpuOverrideImpl<BaseData>;

    prototype.resourceType = 'override';

    makeDereferenceable(
      makeResolvable(prototype, {
        asString() {
          return `override:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');
          ctx.registerOverride(this, id);

          const { dataType, defaultValue } = this[$soul];
          return ctx.gen.declareGlobalOverride({
            id,
            dataType,
            init:
              defaultValue !== undefined
                ? snip(defaultValue, dataType, /* origin */ 'constant')
                : undefined,
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this[$soul].dataType,
              // Immutable, but known only at pipeline creation, so not a WGSL 'constant'
              'runtime-immutable-def',
              /* possibleSideEffects */ false,
            );
          },
        },
        normalMode: {
          get() {
            const { defaultValue } = this[$soul];
            if (defaultValue !== undefined) {
              return defaultValue;
            }

            throw new IllegalVarAccessError(
              isInsideTgpuFn()
                ? `Cannot access override '${getName(this) ?? '<unnamed>'}'. TypeGPU functions that depend on GPU resources need to be part of a compute dispatch or draw call`
                : `Override '${getName(this) ?? '<unnamed>'}' has no default value, so it is inaccessible during normal JS execution`,
            );
          },
        },
      },
    );
  }

  constructor(dataType: TDataType, defaultValue: InferGPU<TDataType> | undefined) {
    this[$soul] = {
      type: 'override',
      dataType,
      defaultValue,
      label: undefined,
    };
  }

  get dataType(): TDataType {
    return this[$soul].dataType;
  }

  get defaultValue(): InferGPU<TDataType> | undefined {
    return this[$soul].defaultValue;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
}

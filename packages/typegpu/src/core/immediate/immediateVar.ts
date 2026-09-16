import { undecorate } from '../../data/dataTypes.ts';
import { snip } from '../../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  isBool,
  isMat,
  isNumericSchema,
  isVec,
  isVecBool,
  isWgslStruct,
} from '../../data/wgslTypes.ts';
import { IllegalVarAccessError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $gpuValueOf, $internal, $soul } from '../../shared/symbols.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';

// ----------
// Public API
// ----------

export interface TgpuImmediateVarSoul<
  TDataType extends BaseData = BaseData,
> extends TgpuSoul<'immediate-var'> {
  readonly dataType: TDataType;
}

export interface TgpuImmediateVar<TDataType extends BaseData = BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly [$soul]: TgpuImmediateVarSoul<TDataType>;
  readonly resourceType: 'immediate-var';
  readonly dataType: TDataType;
  readonly [$gpuValueOf]: InferGPU<TDataType>;
  readonly $: InferGPU<TDataType>;
}

/**
 * Defines a variable in the 'immediate' address space, set from the CPU on a per-draw
 * (or per-dispatch) basis without the overhead of a buffer.
 *
 * Only one immediate variable can be used in a single shader, and its size is limited
 * by the device's `maxImmediateSize` limit. Requires the `immediate_address_space`
 * WGSL language extension, check `root.enabledWgslLanguageFeatures` for support.
 *
 * @param dataType The schema of the held data's type. Cannot contain arrays, atomics or booleans.
 */
export function immediateVar<TDataType extends AnyWgslData>(
  dataType: TDataType,
): TgpuImmediateVar<TDataType> {
  assertValidImmediateSchema(dataType);
  return new TgpuImmediateVarImpl(dataType);
}

export function isImmediateVar(value: unknown): value is TgpuImmediateVar {
  return value instanceof TgpuImmediateVarImpl;
}

// --------------
// Implementation
// --------------

function assertValidImmediateSchema(schema: BaseData, rootSchema: BaseData = schema): void {
  const inner = undecorate(schema);

  if (isWgslStruct(inner)) {
    for (const propType of Object.values(inner.propTypes)) {
      assertValidImmediateSchema(propType, rootSchema);
    }
    return;
  }
  if (isBool(inner) || isVecBool(inner)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates cannot contain booleans (found '${inner.type}'), use u32 or i32 instead`,
    );
  }
  if (!isNumericSchema(inner) && !isVec(inner) && !isMat(inner)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates can only hold scalars, vectors, matrices and structs of those (found '${inner.type}')`,
    );
  }
}

class TgpuImmediateVarImpl<TDataType extends BaseData> implements TgpuImmediateVar<TDataType> {
  readonly [$soul]: TgpuImmediateVarSoul<TDataType>;

  // prototype properties
  declare readonly [$internal]: true;
  declare resourceType: 'immediate-var';
  declare readonly $: InferGPU<TDataType>;
  declare readonly [$gpuValueOf]: InferGPU<TDataType>;

  static {
    const prototype = TgpuImmediateVarImpl.prototype as TgpuImmediateVarImpl<BaseData>;

    prototype.resourceType = 'immediate-var';

    makeDereferenceable(
      makeResolvable(prototype, {
        asString() {
          return `immediateVar:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          ctx.registerImmediate(this);
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');

          return ctx.gen.declareGlobalVar({
            scope: 'immediate',
            id,
            dataType: this[$soul].dataType,
            init: undefined,
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this[$soul].dataType,
              'immediate',
              /* possibleSideEffects */ false,
            );
          },
        },
        normalMode: {
          get() {
            throw new IllegalVarAccessError(
              isInsideTgpuFn()
                ? `Cannot access immediate variable '${getName(this) ?? '<unnamed>'}'. TypeGPU functions that depend on GPU resources need to be part of a compute dispatch or draw call`
                : 'Immediate variables are inaccessible during normal JS execution',
            );
          },
        },
      },
    );
  }

  constructor(dataType: TDataType) {
    this[$soul] = {
      type: 'immediate-var',
      dataType,
      label: undefined,
    };
  }

  get dataType(): TDataType {
    return this[$soul].dataType;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
}

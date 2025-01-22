import type { TgpuNamable } from '../namable';
import type { InferPartialRecord, InferRecord } from '../shared/repr';
import type { Prettify } from '../shared/utilityTypes';
import type { ExoticRecord } from './exotic';
import type { AnyWgslData, BaseWgslData, WgslStruct } from './wgslTypes';

// ----------
// Public API
// ----------

/**
 * Struct schema constructed via `d.struct` function.
 *
 * Responsible for handling reading and writing struct values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its members.
 */
export interface TgpuStruct<TProps extends Record<string, BaseWgslData>>
  extends WgslStruct<TProps>,
    TgpuNamable {
  readonly '~exotic': WgslStruct<ExoticRecord<TProps>>;
}

/**
 * Creates a struct schema that can be used to construct GPU buffers.
 * Ensures proper alignment and padding of properties (as opposed to a `d.unstruct` schema).
 * The order of members matches the passed in properties object.
 *
 * @example
 * const CircleStruct = d.struct({ radius: d.f32, pos: d.vec3f });
 *
 * @param props Record with `string` keys and `TgpuData` values,
 * each entry describing one struct member.
 */
export const struct = <TProps extends Record<string, AnyWgslData>>(
  props: TProps,
): TgpuStruct<Prettify<ExoticRecord<TProps>>> =>
  new TgpuStructImpl(props as ExoticRecord<TProps>);

// --------------
// Implementation
// --------------

class TgpuStructImpl<TProps extends Record<string, AnyWgslData>>
  implements TgpuStruct<TProps>
{
  private _label: string | undefined;

  public readonly type = 'struct';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: InferRecord<TProps>;
  /** Type-token, not available at runtime */
  public readonly '~reprPartial'!: Partial<InferPartialRecord<TProps>>;
  /** Type-token, not available at runtime */
  public readonly '~exotic'!: WgslStruct<ExoticRecord<TProps>>;

  constructor(public readonly propTypes: TProps) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  toString() {
    return `struct:${this.label ?? '<unnamed>'}`;
  }
}

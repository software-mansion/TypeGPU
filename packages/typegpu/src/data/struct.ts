import type { TgpuNamable } from '../namable';
import type { InferRecord } from '../shared/repr';
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
  readonly '~exotic': WgslStruct<TProps>;
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
): TgpuStruct<Prettify<ExoticRecord<TProps>>> => {
  const struct = <T>(props: T) => {
    return props;
  };
  Object.setPrototypeOf(struct, TgpuStructImpl);
  struct.propTypes = props as ExoticRecord<TProps>;
  struct['~repr'] = {} as InferRecord<TProps>;
  struct['~exotic'] = {} as WgslStruct<ExoticRecord<TProps>>;

  return struct as unknown as TgpuStruct<Prettify<ExoticRecord<TProps>>>;
};

// --------------
// Implementation
// --------------

const TgpuStructImpl = {
  type: 'struct',
  _label: undefined as string | undefined,

  get label(): string | undefined {
    return this._label;
  },

  $name(label: string) {
    this._label = label;
    return this;
  },

  toString(): string {
    return `struct:${this.label ?? '<unnamed>'}`;
  },
};

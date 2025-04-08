import { $structTag, type AnyWgslData, type WgslStruct } from './wgslTypes.ts';

// ----------
// Public API
// ----------

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
export function struct<TProps extends Record<string, AnyWgslData>>(
  props: TProps,
): WgslStruct<TProps> {
  const struct = <T>(props: T) => props;
  Object.setPrototypeOf(struct, WgslStructImpl);
  struct.propTypes = props;

  return struct as WgslStruct<TProps>;
}

// --------------
// Implementation
// --------------

const WgslStructImpl = {
  type: 'struct',
  [$structTag]: true,
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

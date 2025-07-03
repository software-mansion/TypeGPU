import { getName, setName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import { schemaCallWrapper } from './utils.ts';
import type { AnyWgslData, WgslStruct } from './wgslTypes.ts';

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
  // in the schema call, create and return a deep copy
  // by wrapping all the values in corresponding schema calls
  const structSchema = <T extends TProps>(instanceProps: T) =>
    Object.fromEntries(
      Object.entries(props).map((
        [key, schema],
      ) => [key, schemaCallWrapper(schema, instanceProps[key])]),
    );
  Object.setPrototypeOf(structSchema, WgslStructImpl);
  structSchema.propTypes = props;

  return structSchema as WgslStruct<TProps>;
}

// --------------
// Implementation
// --------------

const WgslStructImpl = {
  [$internal]: true,
  type: 'struct',

  $name(label: string) {
    setName(this, label);
    return this;
  },

  toString(): string {
    return `struct:${getName(this) ?? '<unnamed>'}`;
  },
};

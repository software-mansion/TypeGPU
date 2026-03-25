import { getName, setName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import type { AnyData, Unstruct } from './dataTypes.ts';
import { schemaCallWrapper } from './schemaCallWrapper.ts';

// ----------
// Public API
// ----------

/**
 * Creates a loose struct schema that can be used to construct vertex buffers.
 * Describes structs with members of both loose and non-loose types.
 *
 * The order of members matches the passed in properties object.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 *
 * @example
 * const CircleStruct = d.unstruct({ radius: d.f32, pos: d.vec3f }); // packed struct with no padding
 *
 * @example
 * const CircleStruct = d.unstruct({ radius: d.f32, pos: d.align(16, d.vec3f) });
 *
 * @param properties Record with `string` keys and `TgpuData` or `TgpuLooseData` values,
 * each entry describing one struct member.
 */
export function unstruct<TProps extends Record<string, AnyData>>(
  properties: TProps,
): Unstruct<TProps> {
  // In the schema call, create and return a deep copy
  // by wrapping all the values in corresponding schema calls.
  const unstructSchema = (instanceProps?: TProps) =>
    Object.fromEntries(
      Object.entries(properties).map(([key, schema]) => [
        key,
        schemaCallWrapper(schema, instanceProps?.[key]),
      ]),
    );
  Object.setPrototypeOf(unstructSchema, UnstructImpl);
  unstructSchema.propTypes = properties;

  return unstructSchema as unknown as Unstruct<TProps>;
}

// --------------
// Implementation
// --------------

const UnstructImpl = {
  [$internal]: true,
  type: 'unstruct',

  $name(label: string) {
    setName(this, label);
    return this;
  },

  toString(): string {
    return `unstruct:${getName(this) ?? '<unnamed>'}`;
  },
};

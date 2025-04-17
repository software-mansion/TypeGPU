import { $internal } from '../shared/symbols.ts';
import type { Unstruct } from './dataTypes.ts';
import type { BaseData } from './wgslTypes.ts';

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
export function unstruct<TProps extends Record<string, BaseData>>(
  properties: TProps,
): Unstruct<TProps> {
  const unstruct = <T>(props: T) => props;
  Object.setPrototypeOf(unstruct, UnstructImpl);
  unstruct.propTypes = properties;

  return unstruct as unknown as Unstruct<TProps>;
}

// --------------
// Implementation
// --------------

const UnstructImpl = {
  [$internal]: true,
  type: 'unstruct',
  _label: undefined as string | undefined,

  get label(): string | undefined {
    return this._label;
  },

  $name(label: string) {
    this._label = label;
    return this;
  },

  toString(): string {
    return `unstruct:${this.label ?? '<unnamed>'}`;
  },
};

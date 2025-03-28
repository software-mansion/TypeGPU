import type { $repr, InferPartialRecord, InferRecord } from '../shared/repr.js';
import type { Unstruct } from './dataTypes.js';
import type { BaseData } from './wgslTypes.js';

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
  return new UnstructImpl(properties as TProps);
}

// --------------
// Implementation
// --------------

class UnstructImpl<TProps extends Record<string, BaseData>>
  implements Unstruct<TProps>
{
  private _label: string | undefined;

  public readonly type = 'unstruct';
  /** Type-token, not available at runtime */
  public declare readonly [$repr]: InferRecord<TProps>;
  /** Type-token, not available at runtime */
  public readonly '~reprPartial'!: Partial<InferPartialRecord<TProps>>;

  constructor(public readonly propTypes: TProps) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }
}

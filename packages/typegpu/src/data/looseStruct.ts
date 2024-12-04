import type { InferRecord } from '../shared/repr';
import type { LooseStruct } from './dataTypes';
import type { ExoticRecord } from './exotic';
import type { BaseWgslData } from './wgslTypes';

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
 * const CircleStruct = d.looseStruct({ radius: d.f32, pos: d.vec3f }); // packed struct with no padding
 *
 * @example
 * const CircleStruct = d.looseStruct({ radius: d.f32, pos: d.align(16, d.vec3f) });
 *
 * @param properties Record with `string` keys and `TgpuData` or `TgpuLooseData` values,
 * each entry describing one struct member.
 */
export const looseStruct = <TProps extends Record<string, BaseWgslData>>(
  properties: TProps,
): LooseStruct<ExoticRecord<TProps>> =>
  new LooseStructImpl(properties as ExoticRecord<TProps>);

// --------------
// Implementation
// --------------

class LooseStructImpl<TProps extends Record<string, BaseWgslData>>
  implements LooseStruct<TProps>
{
  public readonly type = 'loose-struct';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: InferRecord<TProps>;

  constructor(public readonly propTypes: TProps) {}
}

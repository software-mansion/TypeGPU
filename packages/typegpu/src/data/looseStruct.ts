import { roundUp } from '../mathUtils';
import type { InferRecord } from '../shared/repr';
import { getCustomAlignment } from './attributes';
import type { LooseStruct } from './dataTypes';
import { sizeOf } from './sizeOf';
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
): LooseStruct<TProps> => new TgpuLooseStructImpl(properties);

/**
 * Checks whether passed in value is a looseStruct schema,
 * as opposed to, e.g., a struct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas looseStruct schemas cannot. Loose structs are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isLooseStructSchema(d.struct({ a: d.u32 })) // false
 * isLooseStructSchema(d.looseStruct({ a: d.u32 })) // true
 * isLooseStructSchema(d.vec3f) // false
 */
export function isLooseStructSchema<T extends LooseStruct>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.type === 'loose-struct';
}

// --------------
// Implementation
// --------------

class TgpuLooseStructImpl<TProps extends Record<string, BaseWgslData>>
  implements LooseStruct<TProps>
{
  public readonly type = 'loose-struct';

  /** Type-token, not available at runtime */
  public readonly __repr!: InferRecord<TProps>;
  public readonly byteAlignment = 1;
  public readonly size: number;

  private _label: string | undefined;

  constructor(public readonly propTypes: TProps) {
    let size = 0;
    for (const property of Object.values(propTypes)) {
      const alignment = getCustomAlignment(property) ?? 1;
      size = roundUp(size, alignment);
      size += sizeOf(property);
    }

    this.size = size;
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }
}

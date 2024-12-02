import { roundUp } from '../mathUtils';
import type { TgpuNamable } from '../namable';
import type { InferRecord } from '../shared/repr';
import { alignmentOf } from './alignmentOf';
import { sizeOf } from './sizeOf';
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
    TgpuNamable {}

/**
 * Creates a struct schema that can be used to construct GPU buffers.
 * Ensures proper alignment and padding of properties (as opposed to a `d.looseStruct` schema).
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
): TgpuStruct<TProps> => new TgpuStructImpl(props);

// --------------
// Implementation
// --------------

class TgpuStructImpl<TProps extends Record<string, AnyWgslData>>
  implements TgpuStruct<TProps>
{
  private _label: string | undefined;

  public readonly type = 'struct';
  /** Type-token, not available at runtime */
  public readonly size: number;
  public readonly alignment: number;
  public readonly isLoose = false as const; // TODO: Remove
  public readonly __repr!: InferRecord<TProps>;

  constructor(public readonly propTypes: TProps) {
    this.alignment = Object.values(propTypes)
      .map((prop) => alignmentOf(prop))
      .reduce((a, b) => (a > b ? a : b));

    let size = 0;
    for (const property of Object.values(propTypes)) {
      if (Number.isNaN(size)) {
        throw new Error('Only the last property of a struct can be unbounded');
      }

      size = roundUp(size, alignmentOf(property));
      size += sizeOf(property);

      if (Number.isNaN(size) && property.type !== 'array') {
        throw new Error('Cannot nest unbounded struct within another struct');
      }
    }

    this.size = roundUp(size, this.alignment);
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }
}

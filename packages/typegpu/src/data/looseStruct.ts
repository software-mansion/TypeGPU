import {
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type UnwrapRecord,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { AnyTgpuLooseData, TgpuLooseData } from '../types';
import type { AnyWgslData } from './dataTypes';

// ----------
// Public API
// ----------

/**
 * Struct schema constructed via `d.looseStruct` function.
 *
 * Useful for defining vertex buffers, as the standard layout restrictions do not apply.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface TgpuLooseStruct<
  TProps extends Record<string, AnyWgslData | AnyTgpuLooseData>,
> extends TgpuLooseData<UnwrapRecord<TProps>> {}

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
export const looseStruct = <
  TProps extends Record<string, AnyWgslData | AnyTgpuLooseData>,
>(
  properties: TProps,
): TgpuLooseStruct<TProps> => new TgpuLooseStructImpl(properties);

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
export function isLooseStructSchema<
  T extends TgpuLooseStruct<Record<string, AnyWgslData | AnyTgpuLooseData>>,
>(schema: T | unknown): schema is T {
  return schema instanceof TgpuLooseStructImpl;
}

// --------------
// Implementation
// --------------

class TgpuLooseStructImpl<
    TProps extends Record<string, AnyWgslData | AnyTgpuLooseData>,
  >
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuLooseData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  /** Type-token, not available at runtime */
  public readonly __repr!: UnwrapRecord<TProps>;
  public readonly byteAlignment = 1;
  public readonly isLoose = true as const;
  public readonly size: number;

  constructor(public readonly properties: TProps) {
    super();
    this.size = this.measure(MaxValue).size;
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<UnwrapRecord<TProps>>): void {
    for (const [key, property] of Object.entries(this.properties)) {
      property.write(output, value[key]);
    }
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(this.properties)) {
      result[key] = property.read(input);
    }

    return result as Parsed<UnwrapRecord<TProps>>;
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    const maxing = value === MaxValue;
    for (const [key, property] of Object.entries(this.properties)) {
      property.measure(maxing ? MaxValue : value[key], measurer);
    }

    return measurer;
  }
}

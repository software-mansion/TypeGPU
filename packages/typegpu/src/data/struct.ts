import {
  type IMeasurer,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type UnwrapRecord,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { TgpuNamable } from '../namable';
import { code } from '../tgpuCode';
import { identifier } from '../tgpuIdentifier';
import type {
  AnyTgpuData,
  AnyTgpuLooseData,
  ResolutionCtx,
  TgpuData,
  TgpuLooseData,
} from '../types';
import alignIO from './alignIO';
import { isArraySchema } from './array';
import { getAttributesString } from './attributes';

// ----------
// Public API
// ----------

export interface TgpuBaseStruct<TProps extends Record<string, unknown>>
  extends ISchema<UnwrapRecord<TProps>> {
  readonly properties: TProps;
}

/**
 * Struct schema constructed via `d.struct` function.
 *
 * Responsible for handling reading and writing struct values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its members.
 */
export interface TgpuStruct<TProps extends Record<string, AnyTgpuData>>
  extends TgpuBaseStruct<TProps>,
    TgpuData<UnwrapRecord<TProps>>,
    TgpuNamable {}

/**
 * Creates a struct schema that can be used to construct GPU buffers.
 * Ensures proper alignment and padding of properties (as opposed to a `d.looseStruct` schema).
 * The order of members matches the passed in properties object.
 *
 * @example
 * const CircleStruct = d.struct({ radius: d.f32, pos: d.vec3f });
 *
 * @param properties Record with `string` keys and `TgpuData` values,
 * each entry describing one struct member.
 */
export const struct = <TProps extends Record<string, AnyTgpuData>>(
  properties: TProps,
): TgpuStruct<TProps> => new TgpuStructImpl(properties);

/**
 * Struct schema constructed via `d.looseStruct` function.
 *
 * Useful for defining vertex buffers, as the standard layout restrictions do not apply.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface TgpuLooseStruct<
  TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
> extends TgpuBaseStruct<TProps>,
    TgpuLooseData<UnwrapRecord<TProps>> {}

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
  TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
>(
  properties: TProps,
): TgpuLooseStruct<TProps> => new TgpuLooseStructImpl(properties);

/**
 * Checks whether passed in value is a struct schema,
 * as opposed to, e.g., a looseStruct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas looseStruct schemas cannot.
 *
 * @example
 * isStructSchema(d.struct({ a: d.u32 })) // true
 * isStructSchema(d.looseStruct({ a: d.u32 })) // false
 * isStructSchema(d.vec3f) // false
 */
export function isStructSchema<
  T extends TgpuStruct<Record<string, AnyTgpuData>>,
>(schema: T | unknown): schema is T {
  return schema instanceof TgpuStructImpl;
}

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
  T extends TgpuLooseStruct<Record<string, AnyTgpuData | AnyTgpuLooseData>>,
>(schema: T | unknown): schema is T {
  return schema instanceof TgpuLooseStructImpl;
}

// --------------
// Implementation
// --------------

function generateField([key, field]: [string, AnyTgpuData]) {
  return code`  ${getAttributesString(field)}${key}: ${field},\n`;
}

class TgpuStructImpl<TProps extends Record<string, AnyTgpuData>>
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  private _size: number;
  public readonly byteAlignment: number;
  public readonly isLoose = false as const;
  public readonly isRuntimeSized: boolean;

  constructor(public readonly properties: TProps) {
    super();

    this.byteAlignment = Object.values(properties)
      .map((prop) => prop.byteAlignment)
      .reduce((a, b) => (a > b ? a : b));

    this._size = this.measure(MaxValue).size;
    this.isRuntimeSized = Number.isNaN(this._size);
  }

  get size(): number {
    if (this.isRuntimeSized) {
      throw new Error(
        'Cannot get size of struct with runtime sized properties',
      );
    }
    return this._size;
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
    if (this.isRuntimeSized) {
      throw new Error('Cannot write struct with runtime sized properties');
    }
    alignIO(output, this.byteAlignment);

    for (const [key, property] of Object.entries(this.properties)) {
      alignIO(output, property.byteAlignment);
      property.write(output, value[key]);
    }

    alignIO(output, this.byteAlignment);
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    if (this.isRuntimeSized) {
      throw new Error('Cannot read struct with runtime sized properties');
    }
    alignIO(input, this.byteAlignment);
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(this.properties)) {
      alignIO(input, property.byteAlignment);
      result[key] = property.read(input);
    }

    alignIO(input, this.byteAlignment);
    return result as Parsed<UnwrapRecord<TProps>>;
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    let structMeasurer = measurer;
    alignIO(structMeasurer, this.byteAlignment);

    const maxing = value === MaxValue;
    for (const [key, property] of Object.entries(this.properties)) {
      if (structMeasurer.isUnbounded) {
        throw new Error('Only the last property of a struct can be unbounded');
      }

      alignIO(structMeasurer, property.byteAlignment);
      structMeasurer = property.measure(
        maxing ? MaxValue : value[key],
        structMeasurer,
      );

      if (structMeasurer.isUnbounded && !isArraySchema(property)) {
        throw new Error('Cannot nest unbounded struct within another struct');
      }
    }

    alignIO(structMeasurer, this.byteAlignment);
    return structMeasurer;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);

    ctx.addDeclaration(code`
struct ${ident} {
${Object.entries(this.properties).map(generateField)}\
}
`);

    return ctx.resolve(ident);
  }
}

class TgpuLooseStructImpl<
    TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
  >
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuLooseData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

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

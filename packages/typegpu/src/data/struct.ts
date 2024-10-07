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
import { isDecorated, isLooseDecorated } from './attributes';

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
export interface TgpuStruct<TProps extends Record<string, AnyTgpuData>>
  extends ISchema<UnwrapRecord<TProps>>,
    TgpuData<UnwrapRecord<TProps>>,
    TgpuNamable {}

/**
 * Creates a struct schema that can be used to construct gpu buffers.
 * Describes structs with members of non-loose types.
 * The order of members is constant, based on the order in passed in properties object.
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
 * Useful for defining tgpu vertex buffers.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface TgpuLooseStruct<
  TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
> extends ISchema<UnwrapRecord<TProps>>,
    TgpuLooseData<UnwrapRecord<TProps>> {}

/**
 * Creates a loose struct schema that can be used to construct tgpu vertex buffers.
 * Describes structs with members of both loose and non-loose types.
 *
 * The order of members is constant, based on the order in passed in properties object.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 *
 * @example
 * const CircleStruct = d.looseStruct({ radius: d.f32, pos: d.vec3f }); // packed struct with no padding
 *
 *  * @example
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

class TgpuStructImpl<TProps extends Record<string, AnyTgpuData>>
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  public readonly byteAlignment: number;
  public readonly size: number;
  public readonly isLoose = false as const;

  constructor(private readonly _properties: TProps) {
    super();

    this.byteAlignment = Object.values(_properties)
      .map((prop) => prop.byteAlignment)
      .reduce((a, b) => (a > b ? a : b));

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
    alignIO(output, this.byteAlignment);

    for (const [key, property] of Object.entries(this._properties)) {
      alignIO(output, property.byteAlignment);
      property.write(output, value[key]);
    }

    alignIO(output, this.byteAlignment);
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    alignIO(input, this.byteAlignment);
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(this._properties)) {
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
    alignIO(measurer, this.byteAlignment);

    const maxing = value === MaxValue;
    for (const [key, property] of Object.entries(this._properties)) {
      alignIO(measurer, property.byteAlignment);
      property.measure(maxing ? MaxValue : value[key], measurer);
    }

    alignIO(measurer, this.byteAlignment);
    return measurer;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);

    ctx.addDeclaration(code`
struct ${ident} {\
${Object.entries(this._properties).map(([key, field]) => code`\n  ${getAttributes(field) ?? ''}${key}: ${field},`)}
}
    `);

    return ctx.resolve(ident);
  }
}

function getAttributes<T extends AnyTgpuData>(field: T): string | undefined {
  if (!isDecorated(field) && !isLooseDecorated(field)) {
    return undefined;
  }

  return field.attributes
    .map((attrib) => {
      if (attrib.type === 'align') {
        return `@align(${attrib.alignment}) `;
      }

      if (attrib.type) {
        return `@size(${attrib.size}) `;
      }

      return '';
    })
    .join('');
}

class TgpuLooseStructImpl<
    TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
  >
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuLooseData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  public readonly byteAlignment = 1;
  public readonly isCustomAligned = false;
  public readonly isLoose = true as const;
  public readonly size: number;

  constructor(private readonly _properties: TProps) {
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
    for (const [key, property] of Object.entries(this._properties)) {
      property.write(output, value[key]);
    }
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(this._properties)) {
      result[key] = property.read(input);
    }

    return result as Parsed<UnwrapRecord<TProps>>;
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    const maxing = value === MaxValue;
    for (const [key, property] of Object.entries(this._properties)) {
      property.measure(maxing ? MaxValue : value[key], measurer);
    }

    return measurer;
  }
}

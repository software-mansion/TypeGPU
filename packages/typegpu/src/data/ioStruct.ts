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
import type { AnyBuiltin } from '../builtin';
import { RecursiveDataTypeError } from '../errors';
import type { TgpuNamable } from '../namable';
import { code } from '../tgpuCode';
import { identifier } from '../tgpuIdentifier';
import type { AnyTgpuData, ResolutionCtx, TgpuData } from '../types';
import { isAlignedSchema } from './align';
import alignIO from './alignIO';
import { isSizedSchema } from './size';

// ----------
// Public API
// ----------

export interface TgpuIoStruct<
  TProps extends Record<string, AnyTgpuData> = Record<string, AnyTgpuData>,
> extends ISchema<UnwrapRecord<TProps>>,
    TgpuData<UnwrapRecord<TProps>>,
    TgpuNamable {}

export const ioStruct = <
  TProps extends Record<string, AnyTgpuData> = Record<string, AnyTgpuData>,
>(
  properties: TProps,
): TgpuIoStruct<TProps> => new TgpuIoStructImpl(properties);

export function isIoStructSchema<T extends TgpuIoStruct>(
  schema: T | unknown,
): schema is T {
  return schema instanceof TgpuIoStructImpl;
}

// --------------
// Implementation
// --------------

class TgpuIoStructImpl<
    TProps extends Record<string, AnyTgpuData> = Record<
      string,
      AnyTgpuData | AnyBuiltin
    >,
  >
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  public readonly byteAlignment: number;
  public readonly size: number;
  public readonly isLoose = false as const;
  public readonly isCustomAligned = false;

  constructor(private readonly _properties: TProps) {
    super();

    this.byteAlignment = Object.values(_properties)
      .map((prop) => prop.byteAlignment)
      .reduce((a, b) => (a > b ? a : b));

    this.size = this.measure(MaxValue).size;
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

    const result: Record<string, unknown> = {};
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
      struct ${ident} {
        ${Object.entries(this._properties).map(([key, field]) => code`${getAttribute(field) ?? ''}${key}: ${field},\n`)}
      }
    `);

    return ctx.resolve(ident);
  }
}

function getAttribute<T extends AnyTgpuData>(field: T): string | undefined {
  if (isAlignedSchema(field as unknown)) {
    return `@align(${field.byteAlignment}) `;
  }

  if (isSizedSchema(field as unknown)) {
    return `@size(${field.size}) `;
  }

  return undefined;
}

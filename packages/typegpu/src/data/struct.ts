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
  object,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuData,
  TgpuNamable,
} from '../types';
import { code } from '../wgslCode';
import { TgpuIdentifier } from '../wgslIdentifier';
import { TgpuAlignedImpl } from './align';
import alignIO from './alignIO';
import { TgpuDataCustomSizedImpl } from './size';

// ----------
// Public API
// ----------

export interface TgpuStruct<TProps extends Record<string, AnyTgpuData>>
  extends ISchema<UnwrapRecord<TProps>>,
    TgpuData<UnwrapRecord<TProps>>,
    TgpuNamable {}

export const struct = <TProps extends Record<string, AnyTgpuData>>(
  properties: TProps,
): TgpuStruct<TProps> => new TgpuStructImpl(properties);

// --------------
// Implementation
// --------------

class TgpuStructImpl<TProps extends Record<string, AnyTgpuData>>
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;
  private _innerSchema: ISchema<UnwrapRecord<TProps>>;

  public readonly byteAlignment: number;
  public readonly size: number;

  constructor(private readonly _properties: TProps) {
    super();

    this._innerSchema = object(_properties);

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
    this._innerSchema.write(output, value);
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    alignIO(input, this.byteAlignment);
    return this._innerSchema.read(input);
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    this._innerSchema.measure(value, measurer);
    return measurer;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this._label);

    ctx.addDeclaration(code`
      struct ${identifier} {
        ${Object.entries(this._properties).map(([key, field]) => code`${getAttribute(field) ?? ''}${key}: ${field},\n`)}
      }
    `);

    return ctx.resolve(identifier);
  }
}

function getAttribute(field: AnyTgpuData): string | undefined {
  if (field instanceof TgpuAlignedImpl) {
    return `@align(${field.byteAlignment}) `;
  }
  if (field instanceof TgpuDataCustomSizedImpl) {
    return `@size(${field.size}) `;
  }
}

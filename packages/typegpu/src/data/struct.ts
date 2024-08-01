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
import { RecursiveDataTypeError, ResolvableToStringError } from '../errors';
import type {
  AnyWgslData,
  ResolutionCtx,
  WgslData,
  WgslNamable,
} from '../types';
import { code } from '../wgslCode';
import { WgslIdentifier } from '../wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslStruct<TProps extends Record<string, AnyWgslData>>
  extends WgslData<UnwrapRecord<TProps>>,
    WgslNamable {}

export const struct = <TProps extends Record<string, AnyWgslData>>(
  properties: TProps,
): WgslStruct<TProps> => new WgslStructImpl(properties);

// --------------
// Implementation
// --------------

class WgslStructImpl<TProps extends Record<string, AnyWgslData>>
  extends Schema<UnwrapRecord<TProps>>
  implements WgslData<UnwrapRecord<TProps>>, WgslNamable
{
  readonly typeInfo = 'struct';
  private _innerSchema: ISchema<UnwrapRecord<TProps>>;
  private _label: string | undefined;

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

  get label(): string | undefined {
    return this._label;
  }

  $name(label?: string | undefined) {
    this._label = label;
    return this;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<UnwrapRecord<TProps>>): void {
    this._innerSchema.write(output, value);
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    return this._innerSchema.read(input);
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    this._innerSchema.measure(value, measurer);
    return measurer;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    ctx.addDeclaration(code`
      struct ${identifier} {
        ${Object.entries(this._properties).map(([key, field]) => code`${key}: ${field},\n`)}
      }
    `);

    return ctx.resolve(identifier);
  }

  toString(): string {
    throw new ResolvableToStringError(this);
  }

  get debugRepr(): string {
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}`;
  }
}

import {
  type IMeasurer,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type Parsed,
  type UnwrapRecord,
  object,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { AnyWgslData, ResolutionCtx, WgslData } from '../types';
import { code } from '../wgslCode';
import { WgslIdentifier } from '../wgslIdentifier';
import { WgslSchema } from './wgslSchema';

// ----------
// Public API
// ----------

export interface WgslStruct<TProps extends Record<string, AnyWgslData>>
  extends WgslSchema<UnwrapRecord<TProps>>,
    WgslData<UnwrapRecord<TProps>> {}

export const struct = <TProps extends Record<string, AnyWgslData>>(
  properties: TProps,
): WgslStruct<TProps> => new WgslStructImpl(properties);

// --------------
// Implementation
// --------------

class WgslStructImpl<TProps extends Record<string, AnyWgslData>>
  extends WgslSchema<UnwrapRecord<TProps>>
  implements WgslData<UnwrapRecord<TProps>>
{
  readonly typeInfo = 'struct';
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
}

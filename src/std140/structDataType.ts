import {
  IMeasurer,
  ISchema,
  ISerialInput,
  ISerialOutput,
  MaxValue,
  Measurer,
  Parsed,
  Schema,
  UnwrapRecord,
  object,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { IResolutionCtx } from '../types';
import { type WGSLCode, code } from '../wgslCode';
import { identifier } from '../wgslIdentifier';
import { AnyWGSLDataType, WGSLDataType } from './types';

class StructDataType<TProps extends Record<string, AnyWGSLDataType>>
  extends Schema<UnwrapRecord<TProps>>
  implements WGSLDataType<UnwrapRecord<TProps>>
{
  private _innerSchema: ISchema<UnwrapRecord<TProps>>;
  private readonly _identifier = identifier();
  private readonly _definitionCode: WGSLCode;

  public readonly baseAlignment: number;
  public readonly size: number;

  constructor(properties: TProps) {
    super();

    this._innerSchema = object(properties);

    this.baseAlignment = Object.values(properties)
      .map((prop) => prop.baseAlignment)
      .reduce((a, b) => (a > b ? a : b));

    this.size = this.measure(MaxValue).size;

    this._definitionCode = code`struct ${this._identifier} {
      ${Object.entries(properties).map(([key, field]) => code`${key}: ${field},\n`)}
    }`;
  }

  alias(debugLabel: string) {
    this._identifier.alias(debugLabel);
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

  resolve(ctx: IResolutionCtx): string {
    ctx.addDependency(this._definitionCode);

    return ctx.resolve(this._identifier);
  }
}

export default StructDataType;

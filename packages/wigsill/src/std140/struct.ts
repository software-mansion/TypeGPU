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
import type { ResolutionCtx, WgslResolvable } from '../types';
import { code } from '../wgslCode';
import { WgslIdentifier } from '../wgslIdentifier';
import type { AnyWgslData, WgslData } from './types';

class StructDataType<TProps extends Record<string, AnyWgslData>>
  extends Schema<UnwrapRecord<TProps>>
  implements WgslData<UnwrapRecord<TProps>>
{
  private _innerSchema: ISchema<UnwrapRecord<TProps>>;
  private readonly _identifier = new WgslIdentifier();
  private readonly _definitionCode: WgslResolvable;

  public readonly byteAlignment: number;
  public readonly size: number;

  constructor(properties: TProps) {
    super();

    this._innerSchema = object(properties);

    this.byteAlignment = Object.values(properties)
      .map((prop) => prop.byteAlignment)
      .reduce((a, b) => (a > b ? a : b));

    this.size = this.measure(MaxValue).size;

    this._definitionCode = code`struct ${this._identifier} {
      ${Object.entries(properties).map(([key, field]) => code`${key}: ${field},\n`)}
    }`;
  }

  $name(debugLabel: string) {
    this._identifier.$name(debugLabel);
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
    ctx.addDependency(this._definitionCode);

    return ctx.resolve(this._identifier);
  }
}

export const struct = <P extends Record<string, AnyWgslData>>(properties: P) =>
  new StructDataType(properties);

export default StructDataType;

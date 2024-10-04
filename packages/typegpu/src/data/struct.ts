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
import { isDecorated, isLooseDecorated } from './attributes';

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

export interface TgpuLooseStruct<
  TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
> extends ISchema<UnwrapRecord<TProps>>,
    TgpuLooseData<UnwrapRecord<TProps>> {}

export const looseStruct = <
  TProps extends Record<string, AnyTgpuData | AnyTgpuLooseData>,
>(
  properties: TProps,
): TgpuLooseStruct<TProps> => new TgpuLooseStructImpl(properties);

export function isStructSchema<
  T extends TgpuStruct<Record<string, AnyTgpuData>>,
>(schema: T | unknown): schema is T {
  return schema instanceof TgpuStructImpl;
}

// --------------
// Implementation
// --------------

class TgpuStructImpl<TProps extends Record<string, AnyTgpuData>>
  extends Schema<UnwrapRecord<TProps>>
  implements TgpuData<UnwrapRecord<TProps>>
{
  private _label: string | undefined;

  private _size: number;
  public readonly byteAlignment: number;
  public readonly isLoose = false as const;
  public readonly isRuntimeSized: boolean;

  constructor(private readonly _properties: TProps) {
    super();

    this.byteAlignment = Object.values(_properties)
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

    for (const [key, property] of Object.entries(this._properties)) {
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
    let structMeasurer = measurer;
    alignIO(structMeasurer, this.byteAlignment);

    const maxing = value === MaxValue;
    for (const [key, property] of Object.entries(this._properties)) {
      if (maxing && measurer.isUnbounded) {
        throw new Error('Only the last property of a struct can be unbounded');
      }

      alignIO(structMeasurer, property.byteAlignment);
      structMeasurer = property.measure(
        maxing ? MaxValue : value[key],
        structMeasurer,
      );

      if (structMeasurer.isUnbounded && !isArraySchema(property)) {
        throw new Error('Cannot nest unbouded struct within another struct');
      }
    }

    alignIO(structMeasurer, this.byteAlignment);
    return structMeasurer;
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

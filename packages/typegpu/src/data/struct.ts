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
import type { AnyTgpuData, ResolutionCtx, TgpuData } from '../types';
import { isAlignedSchema } from './align';
import alignIO from './alignIO';
import { isArraySchema } from './array';
import { isSizedSchema } from './size';

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
  public readonly isCustomAligned = false;
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
    type Property = keyof Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of exactEntries(this._properties)) {
      alignIO(output, property.byteAlignment);
      property.write(output, value[key as Property]);
    }
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    if (this.isRuntimeSized) {
      throw new Error('Cannot read struct with runtime sized properties');
    }
    alignIO(input, this.byteAlignment);
    type Property = keyof Parsed<UnwrapRecord<TProps>>;
    const result = {} as Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of exactEntries(this._properties)) {
      alignIO(input, property.byteAlignment);
      result[key as Property] = property.read(input) as Parsed<
        UnwrapRecord<TProps>
      >[Property];
    }
    return result;
  }

  measure(
    value: MaxValue | Parsed<UnwrapRecord<TProps>>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    let structMeasurer = measurer;
    alignIO(structMeasurer, this.byteAlignment);
    type Property = keyof Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of exactEntries(this._properties)) {
      if (structMeasurer.isUnbounded) {
        throw new Error('Only the last property can be unbounded');
      }
      alignIO(structMeasurer, property.byteAlignment);
      structMeasurer = property.measure(
        value === MaxValue ? MaxValue : value[key as Property],
        structMeasurer,
      );

      if (structMeasurer.isUnbounded && !isArraySchema(property)) {
        throw new Error('Cannot nest unbouded structs');
      }
    }

    alignIO(structMeasurer, this.byteAlignment);
    return structMeasurer;
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

export function exactEntries<T extends Record<keyof T, T[keyof T]>>(
  record: T,
): [keyof T, T[keyof T]][] {
  return Object.entries(record) as [keyof T, T[keyof T]][];
}

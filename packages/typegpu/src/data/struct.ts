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
import { TgpuAlignedImpl } from './align';
import alignIO from './alignIO';
import { TgpuSizedImpl } from './size';

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
    type Property = keyof Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of exactEntries(this._properties)) {
      alignIO(output, property.byteAlignment);
      property.write(output, value[key as Property]);
    }
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
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
    alignIO(measurer, this.byteAlignment);
    type Property = keyof Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of exactEntries(this._properties)) {
      alignIO(measurer, property.byteAlignment);
      property.measure(
        value === MaxValue ? MaxValue : value[key as Property],
        measurer,
      );
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

function getAttribute(field: AnyTgpuData): string | undefined {
  if (field instanceof TgpuAlignedImpl) {
    return `@align(${field.byteAlignment}) `;
  }
  if (field instanceof TgpuSizedImpl) {
    return `@size(${field.size}) `;
  }
}

export function exactEntries<T extends Record<keyof T, T[keyof T]>>(
  record: T,
): [keyof T, T[keyof T]][] {
  return Object.entries(record) as [keyof T, T[keyof T]][];
}

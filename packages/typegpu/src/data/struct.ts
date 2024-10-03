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
import alignIO from './alignIO';
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

    for (const [key, property] of Object.entries(this._properties)) {
      alignIO(output, property.byteAlignment);
      property.write(output, value[key as Property]);
    }
  }

  read(input: ISerialInput): Parsed<UnwrapRecord<TProps>> {
    alignIO(input, this.byteAlignment);
    type Property = keyof Parsed<UnwrapRecord<TProps>>;
    const result = {} as Parsed<UnwrapRecord<TProps>>;

    for (const [key, property] of Object.entries(this._properties)) {
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

    for (const [key, property] of Object.entries(this._properties)) {
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

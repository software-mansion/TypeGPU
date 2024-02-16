/*
 * Typed-binary types that adhere to the `std140` layout rules.
 */

import {
  type IMeasurer,
  type IRefResolver,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  type IUnstableSchema,
  MaxValue,
  Measurer,
  Schema,
} from 'typed-binary';
import * as TB from 'typed-binary';

export class AlignedSchema<T> extends Schema<T> {
  private innerSchema: ISchema<T>;
  private readonly bitMask: number;
  private readonly inverseBitMask: number;

  constructor(
    private readonly _innerUnstableSchema: IUnstableSchema<T>,
    /**
     * Has to be power of 2
     */
    public readonly baseAlignment: number,
  ) {
    super();

    // In case this isn't part of a keyed chain,
    // let's assume the inner type is stable.
    this.innerSchema = _innerUnstableSchema as ISchema<T>;

    this.bitMask = baseAlignment - 1;
    this.inverseBitMask = ~this.bitMask;
  }

  resolve(ctx: IRefResolver): void {
    this.innerSchema = ctx.resolve(this._innerUnstableSchema);
  }

  write(output: ISerialOutput, value: T): void {
    const offset = output.currentByteOffset & this.bitMask;
    output.skipBytes((this.baseAlignment - offset) & this.bitMask);

    this.innerSchema.write(output, value);
  }

  read(input: ISerialInput): T {
    const offset = input.currentByteOffset & this.bitMask;
    input.skipBytes((this.baseAlignment - offset) & this.bitMask);

    return this.innerSchema.read(input);
  }

  measure(
    value: T | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    const offset = measurer.size & this.bitMask;
    measurer.add((this.baseAlignment - offset) & this.bitMask);

    this.innerSchema.measure(value, measurer);

    return measurer;
  }
}

export const bool = new AlignedSchema(TB.bool, 4);
export const u32 = new AlignedSchema(TB.u32, 4);
export const f32 = new AlignedSchema(TB.f32, 4);

export const vec2u = new AlignedSchema(TB.tupleOf(TB.u32, 2), 8);
export const vec2i = new AlignedSchema(TB.tupleOf(TB.i32, 2), 8);
export const vec2f = new AlignedSchema(TB.tupleOf(TB.f32, 2), 8);
export const vec3u = new AlignedSchema(TB.tupleOf(TB.u32, 3), 16);
export const vec3i = new AlignedSchema(TB.tupleOf(TB.i32, 3), 16);
export const vec3f = new AlignedSchema(TB.tupleOf(TB.f32, 3), 16);
export const vec4u = new AlignedSchema(TB.tupleOf(TB.u32, 4), 16);
export const vec4i = new AlignedSchema(TB.tupleOf(TB.i32, 4), 16);
export const vec4f = new AlignedSchema(TB.tupleOf(TB.f32, 4), 16);

export const mat4f = new AlignedSchema(TB.tupleOf(TB.f32, 16), 16); // array of column vectors

type SchemaMap<T> = { [key in keyof T]: AlignedSchema<T[key]> };
export const object = <
  P extends Record<string, unknown> = Record<string, never>,
>(
  properties: SchemaMap<P>,
) => {
  const maxBaseAlignment = Object.values(properties)
    .map((prop: AlignedSchema<unknown>) => prop.baseAlignment)
    .reduce((a, b) => (a > b ? a : b));

  return new AlignedSchema(TB.object(properties), maxBaseAlignment);
};

export const arrayOf = <T extends AlignedSchema<T['_infered']>>(
  elementType: T,
  size: number,
) => {
  return new AlignedSchema(
    TB.tupleOf(elementType, size),
    elementType.baseAlignment,
  );
};

/*
 * Typed-binary types that adhere to the `std140` layout rules.
 */

import {
  AnySchema,
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type ParseUnwrapped,
  Schema,
  type Unwrap,
} from 'typed-binary';
import * as TB from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { IResolutionCtx, WGSLSegment } from '../types';
import alignIO from './alignIO';
import DynamicArraySchema from './dynamicArraySchema';
import StructDataType from './structDataType';
import type { AnyWGSLDataType, WGSLDataType } from './types';

export class SimpleWGSLDataType<TSchema extends AnySchema>
  extends Schema<Unwrap<TSchema>>
  implements WGSLDataType<Unwrap<TSchema>>
{
  public readonly size: number;

  constructor(
    private readonly _innerSchema: TSchema,
    /**
     * Has to be power of 2
     */
    public readonly baseAlignment: number,
    private readonly _expressionCode: WGSLSegment,
  ) {
    super();

    this.size = this.measure(MaxValue).size;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void {
    alignIO(output, this.baseAlignment);
    this._innerSchema.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TSchema> {
    alignIO(input, this.baseAlignment);
    return this._innerSchema.read(input) as ParseUnwrapped<TSchema>;
  }

  measure(
    value: ParseUnwrapped<TSchema> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.baseAlignment);

    this._innerSchema.measure(value, measurer);

    return measurer;
  }

  resolve(ctx: IResolutionCtx): string {
    return ctx.resolve(this._expressionCode);
  }
}

export const bool = new SimpleWGSLDataType(TB.bool, 4, 'bool');
export const u32 = new SimpleWGSLDataType(TB.u32, 4, 'u32');
export const i32 = new SimpleWGSLDataType(TB.i32, 4, 'i32');
export const f32 = new SimpleWGSLDataType(TB.f32, 4, 'f32');

export const vec2u = new SimpleWGSLDataType(
  TB.tupleOf([TB.u32, TB.u32]),
  8,
  'vec2u',
);
export const vec2i = new SimpleWGSLDataType(
  TB.tupleOf([TB.i32, TB.i32]),
  8,
  'vec2i',
);
export const vec2f = new SimpleWGSLDataType(
  TB.tupleOf([TB.f32, TB.f32]),
  8,
  'vec2f',
);
export const vec3u = new SimpleWGSLDataType(
  TB.tupleOf([TB.u32, TB.u32, TB.u32]),
  16,
  'vec3u',
);
export const vec3i = new SimpleWGSLDataType(
  TB.tupleOf([TB.i32, TB.i32, TB.i32]),
  16,
  'vec3i',
);
export const vec3f = new SimpleWGSLDataType(
  TB.tupleOf([TB.f32, TB.f32, TB.f32]),
  16,
  'vec3f',
);
export const vec4u = new SimpleWGSLDataType(
  TB.tupleOf([TB.u32, TB.u32, TB.u32, TB.u32]),
  16,
  'vec4u',
);
export const vec4i = new SimpleWGSLDataType(
  TB.tupleOf([TB.i32, TB.i32, TB.i32, TB.i32]),
  16,
  'vec4i',
);
export const vec4f = new SimpleWGSLDataType(
  TB.tupleOf([TB.f32, TB.f32, TB.f32, TB.f32]),
  16,
  'vec4f',
);

/**
 * Array of column vectors
 */
export const mat4f = new SimpleWGSLDataType(
  TB.arrayOf(TB.f32, 16),
  16,
  'mat4x4f',
);

export const struct = <P extends Record<string, AnyWGSLDataType>>(
  properties: P,
) => new StructDataType(properties);

export const arrayOf = <TSchema extends AnyWGSLDataType>(
  elementType: TSchema,
  size: number,
) =>
  new SimpleWGSLDataType(
    TB.arrayOf(elementType, size),
    elementType.baseAlignment,
    `array<${elementType}, ${size}>`,
  );

export const dynamicArrayOf = <TSchema extends AnyWGSLDataType>(
  elementType: TSchema,
  capacity: number,
) => new DynamicArraySchema(elementType, capacity);

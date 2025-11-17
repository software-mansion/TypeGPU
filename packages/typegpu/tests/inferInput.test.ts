import { test } from 'typegpu-testing-utility';
import { describe, expect, expectTypeOf } from 'vitest';
import { d, type ValidateBufferSchema } from 'typegpu';

describe('d.InferInput', () => {
  test('d.Infer<T> should be assignable to d.InferInput<T>', ({ root }) => {
    function foo<T extends d.AnyWgslData>(schema: ValidateBufferSchema<T>, input: d.Infer<T>) {
      return root.createBuffer(schema, input);
    }

    expect(() => foo(d.f32, 1)).not.toThrow();
  });

  test('should accept tuples', () => {
    expectTypeOf<[number, number, number]>().toExtend<d.InferInput<d.Vec3f>>();
    expectTypeOf<readonly [number, number, number]>().toExtend<d.InferInput<d.Vec3f>>();
  });

  test('should accept arrays in inferred matrices', () => {
    expectTypeOf<number[]>().toExtend<d.InferInput<d.Mat4x4f>>();
    expectTypeOf<readonly number[]>().toExtend<d.InferInput<d.Mat4x4f>>();
  });

  test('should accept arrays in inferred arrays', () => {
    expectTypeOf<number[]>().toExtend<d.InferInput<d.WgslArray<d.U32>>>();
    expectTypeOf<readonly number[]>().toExtend<d.InferInput<d.WgslArray<d.U32>>>();
  });

  test('should accept arrays in inferred disarrays', () => {
    expectTypeOf<number[]>().toExtend<d.InferInput<d.Disarray<d.U32>>>();
    expectTypeOf<readonly number[]>().toExtend<d.InferInput<d.Disarray<d.U32>>>();
  });
});

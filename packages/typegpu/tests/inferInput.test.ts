import { test } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { d, ValidateBufferSchema } from 'typegpu';

describe('d.InferInput', () => {
  test('d.Infer<T> should be assignable to d.InferInput<T>', ({ root }) => {
    function foo<T extends d.AnyWgslData>(schema: ValidateBufferSchema<T>, input: d.Infer<T>) {
      return root.createBuffer(schema, input);
    }

    expect(() => foo(d.f32, 1)).not.toThrow();
  });
});

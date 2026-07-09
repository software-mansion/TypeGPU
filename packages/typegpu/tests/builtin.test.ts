import { describe, expect, expectTypeOf, it } from 'vitest';
import { tgpu } from 'typegpu';
import * as d from 'typegpu/data';

describe('builtin', () => {
  it('adds a @builtin attribute to a struct field', () => {
    const s1 = d.struct({
      position: d.builtin.position,
    });

    expect(tgpu.resolve([s1], { names: 'strict' })).toContain('@builtin(position) position: vec4f');
  });
});

describe('IsBuiltin', () => {
  it('treats primitives as non-builtin', () => {
    expectTypeOf<d.IsBuiltin<'some'>>().toEqualTypeOf<false>();
  });

  it('treats decorated (other than builtin) as non-builtin', () => {
    expectTypeOf<d.IsBuiltin<d.Decorated<d.Vec3f, []>>>().toEqualTypeOf<false>();

    expectTypeOf<d.IsBuiltin<d.Decorated<d.Vec3f, [d.Align<16>]>>>().toEqualTypeOf<false>();

    expectTypeOf<
      d.IsBuiltin<d.Decorated<d.Vec3f, [d.Size<32>, d.Align<16>]>>
    >().toEqualTypeOf<false>();
  });

  it('treats defined builtins as builtin', () => {
    expectTypeOf<d.IsBuiltin<d.BuiltinPosition>>().toEqualTypeOf<true>();
    expectTypeOf<d.IsBuiltin<d.BuiltinVertexIndex>>().toEqualTypeOf<true>();
  });
});

describe('isBuiltin', () => {
  it('narrows an unknown type to a decorated type', () => {
    const value = d.builtin.position as unknown;
    expectTypeOf(value).toEqualTypeOf<unknown>();

    let passed = false;
    if (d.isBuiltin(value)) {
      passed = true;
      expectTypeOf(value).toEqualTypeOf<
        | d.Decorated<d.AnyWgslData, d.AnyAttribute[]>
        | d.LooseDecorated<d.AnyLooseData, d.AnyAttribute[]>
      >();
    }

    expect(passed).toBeTruthy();
  });

  it('narrows a union to the builtin element', () => {
    const value = d.builtin.position as typeof d.builtin.position | string;
    expectTypeOf(value).toEqualTypeOf<typeof d.builtin.position | string>();

    let passed = false;
    if (d.isBuiltin(value)) {
      passed = true;
      expectTypeOf(value).toEqualTypeOf<d.BuiltinPosition>();
    }

    expect(passed).toBeTruthy();
  });
});

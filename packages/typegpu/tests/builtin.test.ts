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

  it('types clipDistances as an array of f32', () => {
    expectTypeOf(d.builtin.clipDistances).toEqualTypeOf<
      d.Decorated<d.WgslArray<d.F32>, [d.Builtin<'clip_distances'>]>
    >();
  });

  it('resolves a vertex function that outputs clipDistances', () => {
    const main = tgpu.vertexFn({
      out: { pos: d.builtin.position, clip: d.builtin.clipDistances },
    })(() => {
      'use gpu';
      const clip = d.arrayOf(d.f32, 8)();
      clip[0] = 1;
      return { pos: d.vec4f(), clip };
    });

    const wgsl = tgpu.resolve([main], { enableExtensions: ['clip_distances'] });

    expect(wgsl).toMatch(/^enable clip_distances;/);
    expect(wgsl).toContain('@builtin(clip_distances) clip: array<f32, 8>,');
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

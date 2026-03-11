import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OmitBuiltins } from '../src/builtin.ts';
import * as d from '../src/data/index.ts';
import { namespace } from '../src/core/resolve/namespace.ts';
import { resolve } from '../src/resolutionCtx.ts';

describe('builtin', () => {
  it('adds a @builtin attribute to a struct field', () => {
    const s1 = d.struct({
      position: d.builtin.position,
    });

    const opts = {
      namespace: namespace({ names: 'strict' }),
    };

    expect(resolve(s1, opts).code).toContain('@builtin(position) position: vec4f');
  });

  it('can be omitted from a record type', () => {
    const x = {
      a: d.u32,
      b: d.builtin.localInvocationId,
      c: d.f32,
      d: d.builtin.localInvocationIndex,
    };

    type X = typeof x;
    type Omitted = OmitBuiltins<X>;

    expectTypeOf<Omitted>().toEqualTypeOf({
      a: d.u32,
      c: d.f32,
    });
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

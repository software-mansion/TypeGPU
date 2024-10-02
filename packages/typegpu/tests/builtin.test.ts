import { describe, expect, expectTypeOf, it } from 'vitest';
import { f32, u32 } from '../src/data';
import {
  type OmitBuiltins,
  StrictNameRegistry,
  builtin,
  wgsl,
} from '../src/experimental';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('builtin', () => {
  it('creates a builtin variable', () => {
    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${builtin.position};
      let y = ${builtin.frontFacing};
    `;

    expect(resolutionCtx.resolve(code)).toContain('position');
    expect(resolutionCtx.resolve(code)).toContain('front_facing');
  });

  it('is a hybrid type of symbol and a wgsl type', () => {
    const x = builtin.position.x;
    const y = builtin.position.y;
    const z = builtin.position.z;

    // @ts-expect-error
    const p = builtin.position.p;
  });

  it('can be omitted from a record type', () => {
    const x = {
      a: u32,
      b: builtin.localInvocationId,
      c: f32,
      d: builtin.localInvocationIndex,
    };

    type X = typeof x;
    type Omitted = OmitBuiltins<X>;

    expectTypeOf<Omitted>().toEqualTypeOf({
      a: u32,
      c: f32,
    });
  });
});

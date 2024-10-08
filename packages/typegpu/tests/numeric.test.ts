import { describe, it } from 'vitest';
import * as d from '../src/data';

describe('f32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsF32Schema = (_schema: d.F32) => {};

    acceptsF32Schema(d.f32);
    // @ts-expect-error
    acceptsF32Schema(d.i32);
    // @ts-expect-error
    acceptsF32Schema(d.u32);
  });
});

describe('i32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsI32Schema = (_schema: d.I32) => {};

    acceptsI32Schema(d.i32);
    // @ts-expect-error
    acceptsI32Schema(d.u32);
    // @ts-expect-error
    acceptsI32Schema(d.f32);
  });
});

describe('u32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsU32Schema = (_schema: d.U32) => {};

    acceptsU32Schema(d.u32);
    // @ts-expect-error
    acceptsU32Schema(d.i32);
    // @ts-expect-error
    acceptsU32Schema(d.f32);
  });
});

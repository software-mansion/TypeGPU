import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.js';

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

describe('f16', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsF16Schema = (_schema: d.F16) => {};

    acceptsF16Schema(d.f16);
    // @ts-expect-error
    acceptsF16Schema(d.i32);
    // @ts-expect-error
    acceptsF16Schema(d.u32);
  });
});

it('has correct default values', () => {
  expect(d.f32()).toBe(0);
  expect(d.f16()).toBe(0);
  expect(d.i32()).toBe(0);
  expect(d.u32()).toBe(0);
  expect(d.bool()).toBe(false);
});

describe('TGSL', () => {
  it('works for default constructors', () => {
    const main = tgpu.fn([])(() => {
      const f = d.f32();
      const h = d.f16();
      const i = d.i32();
      const u = d.u32();
      const b = d.bool();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const f = 0f;
        const h = 0h;
        const i = 0i;
        const u = 0u;
        const b = false;
      }"
    `);
  });
});

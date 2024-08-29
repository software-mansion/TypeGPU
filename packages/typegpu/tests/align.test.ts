import { describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../src';
import { align, f32, struct, u32, vec3f } from '../src/data';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('align', () => {
  it('adds @align attribute for custom aligned struct members', () => {
    const s1 = struct({
      a: u32,
      b: align(16, u32),
      c: u32,
    }).$name('s1');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    expect(resolutionCtx.resolve(s1)).toContain('@align(16) b: u32,');
  });

  it('changes alignment of a struct containing aligned member', () => {
    expect(
      struct({
        a: u32,
        b: u32,
        c: u32,
      }).byteAlignment,
    ).toEqual(4);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: u32,
      }).byteAlignment,
    ).toEqual(16);
  });

  it('changes size of a struct containing aligned member', () => {
    expect(
      struct({
        a: u32,
        b: u32,
        c: u32,
      }).size,
    ).toEqual(12);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: u32,
      }).size,
    ).toEqual(24);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: align(16, u32),
      }).size,
    ).toEqual(36);

    // nested
    expect(
      struct({
        a: u32,
        b: struct({
          c: f32,
          d: align(16, f32),
        }),
      }).size,
    ).toEqual(36);

    expect(
      struct({
        a: u32,
        b: align(
          32,
          struct({
            c: f32,
            d: align(16, f32),
          }),
        ),
      }).size,
    ).toEqual(52);
  });

  it('throws for invalid align values', () => {
    expect(() => align(11, u32)).toThrow();
    expect(() => align(8, vec3f)).toThrow();
    expect(() => align(-2, u32)).toThrow();
  });
});

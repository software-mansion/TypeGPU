import { describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../src';
import { f32, size, struct, u32, vec3f } from '../src/data';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('size', () => {
  it('adds @size attribute for the custom sized struct members', () => {
    const s1 = struct({
      a: u32,
      b: size(16, u32),
      c: u32,
    }).$name('s1');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    expect(resolutionCtx.resolve(s1)).toContain('@size(16) b: u32,');
  });

  it('changes size of the struct containing aligned member', () => {
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
        b: size(8, u32),
        c: u32,
      }).size,
    ).toEqual(16);

    expect(
      struct({
        a: u32,
        b: size(8, u32),
        c: size(16, u32),
      }).size,
    ).toEqual(28);

    // nested
    expect(
      struct({
        a: u32,
        b: struct({
          c: size(20, f32),
        }),
      }).size,
    ).toEqual(24);

    // taking alignment into account
    expect(
      struct({
        a: struct({
          c: size(17, f32),
        }),
        b: u32,
      }).size,
    ).toEqual(24);
  });

  it('throws for invalid size values', () => {
    expect(() => size(3, u32)).toThrow();
    size(4, u32);

    expect(() => size(11, vec3f)).toThrow();
    size(12, vec3f);

    expect(() => size(-2, u32)).toThrow();
  });
});

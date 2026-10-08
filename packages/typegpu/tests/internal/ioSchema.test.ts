import { describe, expect, expectTypeOf, it } from 'vitest';
import { type IOLayoutToSchema, withLocations } from '../../src/core/function/ioSchema.ts';
import { d } from 'typegpu';

describe('withLocations', () => {
  it("adds location attribute to non-builtin schemas in a record, if they don't have custom location specified", () => {
    expect(
      withLocations({
        a: d.f32,
        pos: d.builtin.position,
        b: d.vec4f,
      }),
    ).toStrictEqual({
      a: d.location(0, d.f32),
      pos: d.builtin.position,
      b: d.location(1, d.vec4f),
    });

    expect(
      withLocations({
        a: d.location(5, d.vec4f),
        b: d.vec4f,
        pos: d.builtin.position,
      }),
    ).toStrictEqual({
      a: d.location(5, d.vec4f),
      b: d.location(0, d.vec4f),
      pos: d.builtin.position,
    });
  });

  it('uses passed locations map, if no custom location specified', () => {
    expect(
      withLocations(
        {
          a: d.location(5, d.vec4f),
          b: d.vec4f,
          c: d.vec4f,
          pos: d.builtin.position,
        },
        { b: 1 },
      ),
    ).toStrictEqual({
      a: d.location(5, d.vec4f),
      b: d.location(1, d.vec4f),
      c: d.location(0, d.vec4f),
      pos: d.builtin.position,
    });
  });

  it('does not duplicate location indices', () => {
    expect(
      withLocations({
        pos: d.builtin.position,
        a: d.location(5, d.vec4f),
        b: d.vec4f,
        c: d.location(6, d.vec4f),
      }),
    ).toStrictEqual({
      pos: d.builtin.position,
      a: d.location(5, d.vec4f),
      b: d.location(0, d.vec4f),
      c: d.location(6, d.vec4f),
    });
  });

  it('applies location given as an optional argument', () => {
    expect(
      withLocations(
        {
          a: d.vec4f,
          b: d.location(1, d.vec4f),
          c: d.vec4f,
          d: d.location(7, d.vec4f),
          e: d.builtin.position,
        },
        { a: 2, b: 1 },
      ),
    ).toStrictEqual({
      a: d.location(2, d.vec4f),
      b: d.location(1, d.vec4f),
      c: d.location(0, d.vec4f),
      d: d.location(7, d.vec4f),
      e: d.builtin.position,
    });
  });

  it('interpolates integers', () => {
    expect(
      withLocations(
        {
          a: d.i32,
          b: d.u32,
          c: d.vec2u,
          d: d.vec3i,
          e: d.f32,
          f: d.vec4f,
          g: d.builtin.instanceIndex,
        },
        undefined,
        true,
      ),
    ).toStrictEqual({
      a: d.location(0, d.interpolate('flat', d.i32)),
      b: d.location(1, d.interpolate('flat', d.u32)),
      c: d.location(2, d.interpolate('flat', d.vec2u)),
      d: d.location(3, d.interpolate('flat', d.vec3i)),
      e: d.location(4, d.f32),
      f: d.location(5, d.vec4f),
      g: d.builtin.instanceIndex,
    });
  });

  it('does not ignore given location 0', () => {
    expect(
      withLocations(
        {
          a: d.vec4f,
          b: d.vec4f,
        },
        { b: 0 },
      ),
    ).toStrictEqual({
      a: d.location(1, d.vec4f),
      b: d.location(0, d.vec4f),
    });
  });
});

describe('IOLayoutToSchema', () => {
  it('decorates types in a struct with location attribute for non-builtins and no custom locations', () => {
    expectTypeOf<
      IOLayoutToSchema<{
        a: d.Decorated<d.Vec4f, [d.Location<5>]>;
        b: d.Vec4f;
        pos: d.BuiltinPosition;
      }>
    >().toEqualTypeOf<
      d.WgslStruct<{
        a: d.Decorated<d.Vec4f, [d.Location<5>]>;
        b: d.Decorated<d.Vec4f, [d.Location]>;
        pos: d.BuiltinPosition;
      }>
    >();
  });

  it('decorates non-struct types', () => {
    expectTypeOf<IOLayoutToSchema<d.Vec4f>>().toEqualTypeOf<
      d.Decorated<d.Vec4f, [d.Location<0>]>
    >();
  });
});

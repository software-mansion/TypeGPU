import { describe, expect, expectTypeOf, it } from 'vitest';
import { type IOLayoutToSchema, withLocations } from '../src/core/function/ioSchema.ts';
import * as d from '../src/data/index.ts';

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

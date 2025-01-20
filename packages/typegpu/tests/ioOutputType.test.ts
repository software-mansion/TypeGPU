import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type IOLayoutToOutputSchema,
  withLocations,
} from '../src/core/function/ioOutputType';
import * as d from '../src/data';

describe('withLocations', () => {
  it("adds location attribute to non-builtin schemas in a record, if they don't have custom location specified", () => {
    expect(
      withLocations({
        a: d.f32,
        pos: d.builtin.position,
        b: d.vec4f,
      }),
    ).toEqual({
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
    ).toEqual({
      a: d.location(5, d.vec4f),
      b: d.location(6, d.vec4f),
      pos: d.builtin.position,
    });
  });
});

describe('IOLayoutToOutputSchema', () => {
  it('decorates types in a struct with location attribute for non-builtins and no custom locations', () => {
    expectTypeOf<
      IOLayoutToOutputSchema<{
        a: d.Decorated<d.Vec4f, [d.Location<5>]>;
        b: d.Vec4f;
        pos: d.BuiltinPosition;
      }>
    >().toEqualTypeOf<
      d.TgpuStruct<{
        a: d.Decorated<d.Vec4f, [d.Location<5>]>;
        b: d.Decorated<d.Vec4f, [d.Location<number>]>;
        pos: d.BuiltinPosition;
      }>
    >();
  });

  it('decorates non-struct types', () => {
    expectTypeOf<IOLayoutToOutputSchema<d.Vec4f>>().toEqualTypeOf<
      d.Decorated<d.Vec4f, [d.Location<0>]>
    >();
  });
});

import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../../../src/index.js';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../../../src/data/index.ts';
import { select } from '../../../src/std/boolean.ts';

describe('select', () => {
  it('selects for numbers', () => {
    expect(select(1, 2, false)).toBe(1);
    expect(select(1, 2, true)).toBe(2);
  });

  it('selects for booleans', () => {
    expect(select(true, false, false)).toBe(true);
    expect(select(true, false, true)).toBe(false);
  });

  it('selects for f32 vectors', () => {
    expect(
      select(vec2f(-1.1, -2.2), vec2f(1.1, 2.2), vec2b(false, true)),
    ).toStrictEqual(vec2f(-1.1, 2.2));
    expect(
      select(
        vec3f(-1.1, -2.2, -3.3),
        vec3f(1.1, 2.2, 3.3),
        vec3b(true, false, true),
      ),
    ).toStrictEqual(vec3f(1.1, -2.2, 3.3));
    expect(
      select(
        vec4f(-1.1, -2.2, -3.3, -4.4),
        vec4f(1.1, 2.2, 3.3, 4.4),
        vec4b(true, true, false, false),
      ),
    ).toStrictEqual(vec4f(1.1, 2.2, -3.3, -4.4));
  });

  it('selects for f16 vectors', () => {
    expect(
      select(vec2h(-1.1, -2.2), vec2h(1.1, 2.2), vec2b(false, true)),
    ).toStrictEqual(vec2h(-1.1, 2.2));
    expect(
      select(
        vec3h(-1.1, -2.2, -3.3),
        vec3h(1.1, 2.2, 3.3),
        vec3b(true, false, true),
      ),
    ).toStrictEqual(vec3h(1.1, -2.2, 3.3));
    expect(
      select(
        vec4h(-1.1, -2.2, -3.3, -4.4),
        vec4h(1.1, 2.2, 3.3, 4.4),
        vec4b(true, true, false, false),
      ),
    ).toStrictEqual(vec4h(1.1, 2.2, -3.3, -4.4));
  });

  it('selects for i32 vectors', () => {
    expect(
      select(vec2i(-1, -2), vec2i(1, 2), vec2b(true, false)),
    ).toStrictEqual(vec2i(1, -2));
    expect(
      select(vec3i(-1, -2, -3), vec3i(1, 2, 3), vec3b(true, true, false)),
    ).toStrictEqual(vec3i(1, 2, -3));
    expect(
      select(
        vec4i(-1, -2, -3, -4),
        vec4i(1, 2, 3, 4),
        vec4b(true, false, false, true),
      ),
    ).toStrictEqual(vec4i(1, -2, -3, 4));
  });

  it('selects for u32 vectors', () => {
    expect(
      select(vec2u(11, 12), vec2u(1, 2), vec2b(true, false)),
    ).toStrictEqual(vec2u(1, 12));
    expect(
      select(vec3u(11, 12, 13), vec3u(1, 2, 3), vec3b(true, true, false)),
    ).toStrictEqual(vec3u(1, 2, 13));
    expect(
      select(
        vec4u(11, 12, 13, 14),
        vec4u(1, 2, 3, 4),
        vec4b(true, false, false, true),
      ),
    ).toStrictEqual(vec4u(1, 12, 13, 4));
  });

  it('selects for bool vectors', () => {
    expect(
      select(vec2b(true, true), vec2b(false, false), vec2b(true, false)),
    ).toStrictEqual(vec2b(false, true));
    expect(
      select(
        vec3b(true, false, true),
        vec3b(false, true, false),
        vec3b(true, true, false),
      ),
    ).toStrictEqual(vec3b(false, true, true));
    expect(
      select(
        vec4b(true, false, false, true),
        vec4b(false, true, true, false),
        vec4b(true, false, false, true),
      ),
    ).toStrictEqual(vec4b(false, false, false, false));
  });
});

describe('select (on the GPU)', () => {
  it('unifies numeric literal inputs to a common type', () => {
    const cond = tgpu.privateVar(d.bool);

    const foo = () => {
      'use gpu';
      return select(d.u32(1), d.i32(2), cond.$);
    };

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "var<private> cond: bool;

      fn foo() -> i32 {
        return select(1i, 2i, cond);
      }"
    `);
  });
});

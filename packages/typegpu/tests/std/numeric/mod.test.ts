import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../../../src/data/index.ts';
import type {
  v2f,
  v2h,
  v2i,
  v2u,
  v3f,
  v3h,
  v3i,
  v3u,
  v4f,
  v4h,
  v4i,
  v4u,
} from '../../../src/data/wgslTypes.ts';
import { isCloseTo, mod } from '../../../src/std/index.ts';
import { VectorOps } from '../../../src/data/vectorOps.ts';

describe('mod', () => {
  it('computes modulo of a number and a number', () => {
    expect(mod(17, 5)).toEqual(2);
    expect(mod(23, 7)).toEqual(2);
    expect(mod(10, 3)).toEqual(1);
    expect(mod(-10, 3)).toEqual(-1); // JS modulo behavior
  });

  it('computes component-wise modulo of vec2f vectors', () => {
    expect(mod(vec2f(5, 10), vec2f(3, 4))).toEqual(vec2f(2, 2));
    expect(isCloseTo(mod(vec2f(7.5, 3.5), vec2f(2, 2)), vec2f(1.5, 1.5))).toBe(
      true,
    );
  });

  it('computes component-wise modulo of vec2h vectors', () => {
    expect(mod(vec2h(5, 10), vec2h(3, 4))).toEqual(vec2h(2, 2));
    expect(isCloseTo(mod(vec2h(7.5, 3.5), vec2h(2, 2)), vec2h(1.5, 1.5))).toBe(
      true,
    );
  });

  it('computes component-wise modulo of vec2i vectors', () => {
    expect(mod(vec2i(5, 10), vec2i(3, 4))).toEqual(vec2i(2, 2));
    expect(mod(vec2i(-5, 10), vec2i(3, 4))).toEqual(vec2i(-2, 2));
  });

  it('computes component-wise modulo of vec2u vectors', () => {
    expect(mod(vec2u(5, 10), vec2u(3, 4))).toEqual(vec2u(2, 2));
    expect(mod(vec2u(0, 10), vec2u(3, 3))).toEqual(vec2u(0, 1));
  });

  it('computes component-wise modulo of vec3f vectors', () => {
    expect(mod(vec3f(5, 10, 15), vec3f(3, 4, 5))).toEqual(vec3f(2, 2, 0));
    expect(
      isCloseTo(
        mod(vec3f(7.5, 3.5, 9.3), vec3f(2, 2, 3)),
        vec3f(1.5, 1.5, 0.3),
      ),
    ).toBe(true);
  });

  it('computes component-wise modulo of vec3h vectors', () => {
    expect(mod(vec3h(5, 10, 15), vec3h(3, 4, 5))).toEqual(vec3h(2, 2, 0));
    expect(
      isCloseTo(
        mod(vec3h(7.5, 3.5, 9.3), vec3h(2, 2, 3)),
        vec3h(1.5, 1.5, 0.3),
      ),
    ).toBe(true);
  });

  it('computes component-wise modulo of vec3i vectors', () => {
    expect(mod(vec3i(5, 10, 15), vec3i(3, 4, 5))).toEqual(vec3i(2, 2, 0));
    expect(mod(vec3i(-5, 10, -15), vec3i(3, 4, 5))).toEqual(vec3i(-2, 2, 0));
  });

  it('computes component-wise modulo of vec3u vectors', () => {
    expect(mod(vec3u(5, 10, 15), vec3u(3, 4, 5))).toEqual(vec3u(2, 2, 0));
    expect(mod(vec3u(0, 10, 7), vec3u(3, 3, 4))).toEqual(vec3u(0, 1, 3));
  });

  it('computes component-wise modulo of vec4f vectors', () => {
    expect(mod(vec4f(5, 10, 15, 20), vec4f(3, 4, 5, 6))).toEqual(
      vec4f(2, 2, 0, 2),
    );
    expect(
      isCloseTo(
        mod(vec4f(7.5, 3.5, 9.3, 12.7), vec4f(2, 2, 3, 5)),
        vec4f(1.5, 1.5, 0.3, 2.7),
      ),
    ).toBe(true);
  });

  it('computes component-wise modulo of vec4h vectors', () => {
    expect(mod(vec4h(5, 10, 15, 20), vec4h(3, 4, 5, 6))).toEqual(
      vec4h(2, 2, 0, 2),
    );
    expect(
      isCloseTo(
        mod(vec4h(7.5, 3.5, 9.3, 12.7), vec4h(2, 2, 3, 5)),
        vec4h(1.5, 1.5, 0.3, 2.7),
      ),
    ).toBe(true);
  });

  it('computes component-wise modulo of vec4i vectors', () => {
    expect(mod(vec4i(5, 10, 15, 20), vec4i(3, 4, 5, 6))).toEqual(
      vec4i(2, 2, 0, 2),
    );
    expect(mod(vec4i(-5, 10, -15, 20), vec4i(3, 4, 5, 6))).toEqual(
      vec4i(-2, 2, 0, 2),
    );
  });

  it('computes component-wise modulo of vec4u vectors', () => {
    expect(mod(vec4u(5, 10, 15, 20), vec4u(3, 4, 5, 6))).toEqual(
      vec4u(2, 2, 0, 2),
    );
    expect(mod(vec4u(0, 10, 7, 16), vec4u(3, 3, 4, 5))).toEqual(
      vec4u(0, 1, 3, 1),
    );
  });
});

describe('mod overload', () => {
  it('has correct return type for vector-vector operations', () => {
    expectTypeOf(mod(vec2f(), vec2f())).toEqualTypeOf<v2f>();
    expectTypeOf(mod(vec2h(), vec2h())).toEqualTypeOf<v2h>();
    expectTypeOf(mod(vec2i(), vec2i())).toEqualTypeOf<v2i>();
    expectTypeOf(mod(vec2u(), vec2u())).toEqualTypeOf<v2u>();

    expectTypeOf(mod(vec3f(), vec3f())).toEqualTypeOf<v3f>();
    expectTypeOf(mod(vec3h(), vec3h())).toEqualTypeOf<v3h>();
    expectTypeOf(mod(vec3i(), vec3i())).toEqualTypeOf<v3i>();
    expectTypeOf(mod(vec3u(), vec3u())).toEqualTypeOf<v3u>();

    expectTypeOf(mod(vec4f(), vec4f())).toEqualTypeOf<v4f>();
    expectTypeOf(mod(vec4h(), vec4h())).toEqualTypeOf<v4h>();
    expectTypeOf(mod(vec4i(), vec4i())).toEqualTypeOf<v4i>();
    expectTypeOf(mod(vec4u(), vec4u())).toEqualTypeOf<v4u>();
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    (() => mod(vec2f(), vec2i()));
    // @ts-expect-error
    (() => mod(vec2f(), vec3f()));
    // @ts-expect-error
    (() => mod(vec3i(), vec4i()));
  });
});

describe('VectorOps.modMixed vec and scalar', () => {
  it('computes modulo of vec2f and a scalar', () => {
    expect(VectorOps.modMixed.vec2f(vec2f(5, 10), 3)).toEqual(vec2f(2, 1));
    expect(
      isCloseTo(VectorOps.modMixed.vec2f(vec2f(7.5, 3.5), 2), vec2f(1.5, 1.5)),
    ).toBe(true);
  });

  it('computes modulo of vec2h and a scalar', () => {
    expect(VectorOps.modMixed.vec2h(vec2h(5, 10), 3)).toEqual(vec2h(2, 1));
    expect(
      isCloseTo(VectorOps.modMixed.vec2h(vec2h(7.5, 3.5), 2), vec2h(1.5, 1.5)),
    ).toBe(true);
  });

  it('computes modulo of vec2i and a scalar', () => {
    expect(VectorOps.modMixed.vec2i(vec2i(5, 10), 3)).toEqual(vec2i(2, 1));
    expect(VectorOps.modMixed.vec2i(vec2i(-5, 10), 3)).toEqual(vec2i(-2, 1));
  });

  it('computes modulo of vec2u and a scalar', () => {
    expect(VectorOps.modMixed.vec2u(vec2u(5, 10), 3)).toEqual(vec2u(2, 1));
    expect(VectorOps.modMixed.vec2u(vec2u(0, 10), 3)).toEqual(vec2u(0, 1));
  });

  it('computes modulo of vec3f and a scalar', () => {
    expect(VectorOps.modMixed.vec3f(vec3f(5, 10, 15), 3)).toEqual(
      vec3f(2, 1, 0),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec3f(vec3f(7.5, 3.5, 9.3), 2),
        vec3f(1.5, 1.5, 1.3),
      ),
    ).toBe(true);
  });

  it('computes modulo of vec4f and a scalar', () => {
    expect(VectorOps.modMixed.vec4f(vec4f(5, 10, 15, 20), 3)).toEqual(
      vec4f(2, 1, 0, 2),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec4f(vec4f(7.5, 3.5, 9.3, 12.7), 2),
        vec4f(1.5, 1.5, 1.3, 0.7),
      ),
    ).toBe(true);
  });
});

describe('VectorOps.modMixed scalar and vec', () => {
  it('computes modulo of a scalar and vec2f', () => {
    expect(VectorOps.modMixed.vec2f(10, vec2f(3, 4))).toEqual(vec2f(1, 2));
    expect(
      isCloseTo(VectorOps.modMixed.vec2f(7.5, vec2f(2, 3)), vec2f(1.5, 1.5)),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec2h', () => {
    expect(VectorOps.modMixed.vec2h(10, vec2h(3, 4))).toEqual(vec2h(1, 2));
    expect(
      isCloseTo(VectorOps.modMixed.vec2h(7.5, vec2h(2, 3)), vec2h(1.5, 1.5)),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec2i', () => {
    expect(VectorOps.modMixed.vec2i(10, vec2i(3, 4))).toEqual(vec2i(1, 2));
    expect(VectorOps.modMixed.vec2i(-10, vec2i(3, 4))).toEqual(vec2i(-1, -2));
  });

  it('computes modulo of a scalar and vec2u', () => {
    expect(VectorOps.modMixed.vec2u(10, vec2u(3, 4))).toEqual(vec2u(1, 2));
    expect(VectorOps.modMixed.vec2u(15, vec2u(6, 7))).toEqual(vec2u(3, 1));
  });

  it('computes modulo of a scalar and vec3f', () => {
    expect(VectorOps.modMixed.vec3f(15, vec3f(3, 4, 5))).toEqual(
      vec3f(0, 3, 0),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec3f(9.3, vec3f(2, 3, 4)),
        vec3f(1.3, 0.3, 1.3),
      ),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec3h', () => {
    expect(VectorOps.modMixed.vec3h(15, vec3h(3, 4, 5))).toEqual(
      vec3h(0, 3, 0),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec3h(9.3, vec3h(2, 3, 4)),
        vec3h(1.3, 0.3, 1.3),
      ),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec3i', () => {
    expect(VectorOps.modMixed.vec3i(15, vec3i(3, 4, 5))).toEqual(
      vec3i(0, 3, 0),
    );
    expect(VectorOps.modMixed.vec3i(-15, vec3i(3, 4, 5))).toEqual(
      vec3i(0, -3, 0),
    );
  });

  it('computes modulo of a scalar and vec3u', () => {
    expect(VectorOps.modMixed.vec3u(15, vec3u(3, 4, 5))).toEqual(
      vec3u(0, 3, 0),
    );
    expect(VectorOps.modMixed.vec3u(20, vec3u(6, 7, 8))).toEqual(
      vec3u(2, 6, 4),
    );
  });

  it('computes modulo of a scalar and vec4f', () => {
    expect(VectorOps.modMixed.vec4f(20, vec4f(3, 4, 5, 6))).toEqual(
      vec4f(2, 0, 0, 2),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec4f(12.7, vec4f(2, 3, 4, 5)),
        vec4f(0.7, 0.7, 0.7, 2.7),
      ),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec4h', () => {
    expect(VectorOps.modMixed.vec4h(20, vec4h(3, 4, 5, 6))).toEqual(
      vec4h(2, 0, 0, 2),
    );
    expect(
      isCloseTo(
        VectorOps.modMixed.vec4h(12.7, vec4h(2, 3, 4, 5)),
        vec4h(0.7, 0.7, 0.7, 2.7),
      ),
    ).toBe(true);
  });

  it('computes modulo of a scalar and vec4i', () => {
    expect(VectorOps.modMixed.vec4i(20, vec4i(3, 4, 5, 6))).toEqual(
      vec4i(2, 0, 0, 2),
    );
    expect(VectorOps.modMixed.vec4i(-20, vec4i(3, 4, 5, 6))).toEqual(
      vec4i(-2, 0, 0, -2),
    );
  });

  it('computes modulo of a scalar and vec4u', () => {
    expect(VectorOps.modMixed.vec4u(20, vec4u(3, 4, 5, 6))).toEqual(
      vec4u(2, 0, 0, 2),
    );
    expect(VectorOps.modMixed.vec4u(25, vec4u(6, 7, 8, 9))).toEqual(
      vec4u(1, 4, 1, 7),
    );
  });
});

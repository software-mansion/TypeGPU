import { describe, expect } from 'vitest';
import { CAPTURE, captureSnippets, it, test } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

describe('Swizzle assignment', () => {
  describe('JS', () => {
    it('allows for swizzle assignment', () => {
      const vec = d.vec4f();

      vec.xyzw = d.vec4f(1, 2, 3, 4);

      expect(vec).toStrictEqual(d.vec4f(1, 2, 3, 4));
    });

    it('covers all counts in both variants', () => {
      let vec = d.vec4f();
      vec.wy = d.vec2f(1, 2);
      expect(vec).toStrictEqual(d.vec4f(0, 2, 0, 1));

      vec = d.vec4f();
      vec.zxw = d.vec3f(1, 2, 3);
      expect(vec).toStrictEqual(d.vec4f(2, 0, 1, 3));

      vec = d.vec4f();
      vec.wzyx = d.vec4f(1, 2, 3, 4);
      expect(vec).toStrictEqual(d.vec4f(4, 3, 2, 1));

      vec = d.vec4f();
      vec.ag = d.vec2f(1, 2);
      expect(vec).toStrictEqual(d.vec4f(0, 2, 0, 1));

      vec = d.vec4f();
      vec.bra = d.vec3f(1, 2, 3);
      expect(vec).toStrictEqual(d.vec4f(2, 0, 1, 3));

      vec = d.vec4f();
      vec.abgr = d.vec4f(1, 2, 3, 4);
      expect(vec).toStrictEqual(d.vec4f(4, 3, 2, 1));
    });

    it('allows for partial swizzle assignment', () => {
      const vec = d.vec4f();

      vec.xzw = d.vec3f(1, 3, 4);

      expect(vec).toStrictEqual(d.vec4f(1, 0, 3, 4));
    });

    it('mimcs wgsl order of execution', () => {
      // https://www.w3.org/TR/WGSL/#example-95005bab
      let v: [d.v4u] = [d.vec4u()];

      function updateAndIndex() {
        v[0] = std.add(v[0], d.vec4u(2, 4, 8, 10));
        return 0;
      }

      function updateAndRhs() {
        v[0].x = 900;
        v[0].z = 100;
        return d.vec2u(55, 66);
      }

      function evalOrderSwizzleAssignment() {
        v[0] = d.vec4u(0, 0, 0, 0);

        v[updateAndIndex()]!.yx = updateAndRhs();

        return v[0];
      }

      expect(evalOrderSwizzleAssignment()).toStrictEqual(d.vec4u(66, 55, 100, 10));
    });

    it('disallows repeated assignments', () => {
      const vec = d.vec4f(-1);

      expect(() => {
        // @ts-expect-error
        vec.xx = d.vec2f(1);
      }).toThrowErrorMatchingInlineSnapshot(
        `[TypeError: Cannot set property xx of [object Object] which has only a getter]`,
      );

      expect(() => {
        // @ts-expect-error
        vec.xzx = d.vec3f(1);
      }).toThrowErrorMatchingInlineSnapshot(
        `[TypeError: Cannot set property xzx of [object Object] which has only a getter]`,
      );
    });

    it('allows for self assignment', () => {
      const vec = d.vec4f(1, 2, 3, 4);

      vec.wzyx = vec;

      expect(vec).toStrictEqual(d.vec4f(4, 3, 2, 1));
    });
  });
});

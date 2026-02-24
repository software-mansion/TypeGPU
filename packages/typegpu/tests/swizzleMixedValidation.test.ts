import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.js';

describe('Mixed swizzle validation', () => {
  describe('JS validation', () => {
    it('should allow pure xyzw swizzles', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      expect(vec.xyzw).toBeDefined();
      expect(vec.xy).toBeDefined();
      expect(vec.zw).toBeDefined();
      expect(vec.xyz).toBeDefined();
    });

    it('should allow pure rgba swizzles', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      expect(vec.rgba).toBeDefined();
      expect(vec.rg).toBeDefined();
      expect(vec.ba).toBeDefined();
      expect(vec.rgb).toBeDefined();
    });

    it('should NOT create properties for mixed xyzw and rgba swizzles', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      // These mixed swizzle properties should not exist
      // @ts-expect-error
      expect(vec.xrgy).toBeUndefined();
      // @ts-expect-error
      expect(vec.xr).toBeUndefined();
      // @ts-expect-error
      expect(vec.yg).toBeUndefined();
      // @ts-expect-error
      expect(vec.zb).toBeUndefined();
      // @ts-expect-error
      expect(vec.wa).toBeUndefined();
    });
  });

  describe('GPU code validation', () => {
    it('should resolve pure xyzw swizzles in GPU code', () => {
      const main = tgpu.fn([], d.vec3f)(() => {
        const vec = d.vec4f(1, 2, 3, 4);
        return vec.xyz;
      });

      expect(() => tgpu.resolve([main])).not.toThrow();
      expect(tgpu.resolve([main])).toContain('vec.xyz');
    });

    it('should resolve pure rgba swizzles in GPU code', () => {
      const main = tgpu.fn([], d.vec3f)(() => {
        const vec = d.vec4f(1, 2, 3, 4);
        return vec.rgb;
      });

      expect(() => tgpu.resolve([main])).not.toThrow();
      expect(tgpu.resolve([main])).toContain('vec.rgb');
    });

    it('should NOT resolve mixed xyzw and rgba swizzles in GPU code', () => {
      const main = () => {
        'use gpu';
        const vec = d.vec4f(1, 2, 3, 4);
        // oxlint-disable-next-line typescript/no-explicit-any Accessing a mixed swizzle should cause an error
        const mixed = (vec as any).xrgy;
        return mixed;
      };

      // The resolution should fail because accessProp returns undefined for mixed swizzles
      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:main
        - fn*:main(): Property 'xrgy' not found on value 'vec' of type vec4f]
      `);
    });

    it('should NOT resolve another mixed pattern', () => {
      const main = () => {
        'use gpu';
        const vec = d.vec4f(1, 2, 3, 4);
        // oxlint-disable-next-line typescript/no-explicit-any Accessing a mixed swizzle should cause an error
        const mixed = (vec as any).rgxw;
        return mixed;
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:main
        - fn*:main(): Property 'rgxw' not found on value 'vec' of type vec4f]
      `);
    });
  });

  describe('Edge cases', () => {
    it('should handle single component access for both xyzw and rgba', () => {
      const vec = d.vec4f(1, 2, 3, 4);

      // Single xyzw components should work
      expect(vec.x).toBe(1);
      expect(vec.y).toBe(2);
      expect(vec.z).toBe(3);
      expect(vec.w).toBe(4);

      // Single rgba components should also work
      expect(vec.r).toBe(1);
      expect(vec.g).toBe(2);
      expect(vec.b).toBe(3);
      expect(vec.a).toBe(4);
    });

    it('should not allow invalid characters in swizzles', () => {
      const vec = d.vec4f(1, 2, 3, 4);

      // Invalid characters should result in undefined
      // @ts-expect-error
      expect(vec.xyz1).toBeUndefined();
      // @ts-expect-error
      expect(vec.rgba5).toBeUndefined();
      // @ts-expect-error
      expect(vec.abcd).toBeUndefined();
      // @ts-expect-error
      expect(vec.stuv).toBeUndefined();
    });

    it('should not allow swizzles longer than 4 components', () => {
      const vec = d.vec4f(1, 2, 3, 4);

      // Swizzles longer than 4 should not exist
      // @ts-expect-error
      expect(vec.xyzwx).toBeUndefined();
      // @ts-expect-error
      expect(vec.rgbaa).toBeUndefined();
    });
  });

  describe('All vector types', () => {
    it('should work with vec2 rgba swizzles', () => {
      const vec = d.vec2f(1, 2);
      // @ts-expect-error
      expect(vec.xr).toBeUndefined();
    });

    it('should work with vec3 rgba swizzles', () => {
      const vec = d.vec3f(1, 2, 3);
      // @ts-expect-error
      expect(vec.xrg).toBeUndefined();
    });

    it('should work with integer vectors', () => {
      const vec = d.vec4i(1, 2, 3, 4);
      // @ts-expect-error
      expect(vec.xgba).toBeUndefined();
    });

    it('should work with boolean vectors', () => {
      const vec = d.vec4b(true, false, true, false);
      // @ts-expect-error
      expect(vec.xrba).toBeUndefined();
    });
  });
});

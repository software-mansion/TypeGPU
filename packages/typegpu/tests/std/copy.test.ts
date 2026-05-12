import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import tgpu, { d, std } from '../../src/index.js';

describe('std.copy', () => {
  describe('on the CPU', () => {
    it('copies numerics', () => {
      expect(std.copy(1)).toBe(1);
      expect(std.copy(1.5)).toBe(1.5);
      expect(std.copy(-0)).toBe(-0);
    });

    it('copies vectors', () => {
      const vec = d.vec2u(1, 2);
      const copy = std.copy(vec);

      expect(copy).toStrictEqual(vec);
      expect(copy).not.toBe(vec);
    });

    it('copies matrices', () => {
      const mat = d.mat2x2f(1, 2, 3, 4);
      const copy = std.copy(mat);

      expect(copy).toStrictEqual(mat);
      expect(copy).not.toBe(mat);
    });

    it('copies structs', () => {
      const Boid = d.struct({ prop: d.vec2u });
      const boid = Boid({ prop: d.vec2u(1, 2) });
      const copy = std.copy(boid);

      expect(copy).toStrictEqual(boid);
      expect(copy).not.toBe(boid);
    });
  });

  describe('on the GPU', () => {
    it('works for naturally ephemeral variables', () => {
      const fn = () => {
        'use gpu';
        const a = 1;
        const b = std.copy(a);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          const a = 1;
          let b = a;
        }"
      `);
    });

    it('works for referential variables', () => {
      const fn = () => {
        'use gpu';
        const a = d.vec2u(1, 2);
        const b = std.copy(a);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var a = vec2u(1, 2);
          var b = a;
        }"
      `);
    });

    it('works for arguments', () => {
      const fn = tgpu.fn([d.vec2u])((a) => {
        'use gpu';
        const b = std.copy(a);
        b.x++;
      });

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1(a: vec2u) {
          var b = a;
          b.x++;
        }"
      `);
    });

    it('is not allowed on LHS of assignment', () => {
      const fn = () => {
        'use gpu';
        const a = d.vec2u(1, 2);
        std.copy(a).x = 2;
      };

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
    });
  });
});

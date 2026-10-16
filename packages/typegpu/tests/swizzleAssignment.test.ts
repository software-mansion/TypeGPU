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

  describe('GPU', () => {
    it('allows for swizzle assignment', () => {
      const fn = () => {
        'use gpu';
        const vec = d.vec4f();
        vec.xy = d.vec2f(1, 2);
        vec.wzy = d.vec3f(1, 2, 3);
        vec.xyzw = d.vec4f(vec);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var vec = vec4f();
          vec.xy = vec2f(1, 2);
          vec.wzy = vec3f(1, 2, 3);
          vec.xyzw = vec;
        }"
      `);
    });

    it('allows for swizzle update', () => {
      const fn = () => {
        'use gpu';
        const vec = d.vec4f();
        vec.xy += 1;
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var vec = vec4f();
          vec.xy += 1;
        }"
      `);
    });

    it('allows for number indexed swizzle assignment', () => {
      const fn = () => {
        'use gpu';
        const vec = d.vec4f();
        vec[0] += 1;
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var vec = vec4f();
          vec.x += 1f;
        }"
      `);
    });

    it('allows for string indexed swizzle assignment', () => {
      const fn = () => {
        'use gpu';
        const vec = d.vec4f();
        vec['xy'] += 1;
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var vec = vec4f();
          vec.xy += 1f;
        }"
      `);
    });

    it('disallows string injection', () => {
      const fn = () => {
        'use gpu';
        const vec = d.vec4f();
        vec['xy += 1; destroyWorld(); // ' as unknown as 1] += 1;
      };

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:fn
        - fn*:fn(): Strings cannot be injected into WGSL directly (tried to inject 'xy += 1; destroyWorld(); // '). Look for TypeGPU APIs that cover your use-case, or resort to using tgpu['~unstable'].rawCodeSnippet for raw code injection.]
      `);
    });

    describe('disallows assignment to immutable vectors', () => {
      test('constant', () => {
        const fn = () => {
          'use gpu';
          d.vec2f(1, 2).xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'd.vec2f(1, 2).xy = d.vec2f(1, 2)' is invalid, because the left side is immutable during shader execution. Try using tgpu.privateVar or buffers.]
        `);
      });

      test('constant (update)', () => {
        const fn = () => {
          'use gpu';
          d.vec2f(1, 2).xy += d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'd.vec2f(1, 2).xy += d.vec2f(1, 2)' is invalid, because the left side is immutable during shader execution. Try using tgpu.privateVar or buffers.]
        `);
      });

      test('constant-immutable-def', () => {
        const vec = tgpu.const(d.vec2f, d.vec2f(1, 2));
        const fn = () => {
          'use gpu';
          vec.$.xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'vec.$.xy = d.vec2f(1, 2)' is invalid, because the left side is a constant.]
        `);
      });

      test('runtime-immutable-def', () => {
        const vecs = tgpu.const(d.arrayOf(d.vec2f, 2), [d.vec2f(), d.vec2f()]);
        const fn = () => {
          'use gpu';
          const i = 0;
          vecs.$[i]!.xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'vecs.$[i].xy = d.vec2f(1, 2)' is invalid, because the left side is immutable.]
        `);
      });

      test('uniform', ({ root }) => {
        const vec = root.createUniform(d.vec2f);
        const fn = () => {
          'use gpu';
          vec.$.xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'vec.$.xy = d.vec2f(1, 2)' is invalid, because uniform buffers cannot be mutated.]
        `);
      });

      test('readonly', ({ root }) => {
        const vec = root.createReadonly(d.vec2f);
        const fn = () => {
          'use gpu';
          vec.$.xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'vec.$.xy = d.vec2f(1, 2)' is invalid, because readonly buffers cannot be mutated.]
        `);
      });

      test('immediate', () => {
        const vec = tgpu['~unstable'].immediateVar(d.vec2f);
        const fn = () => {
          'use gpu';
          vec.$.xy = d.vec2f(1, 2);
        };

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:fn
          - fn*:fn(): 'vec.$.xy = d.vec2f(1, 2)' is invalid, because immediate variables cannot be mutated.]
        `);
      });

      test('argument', () => {
        const fn = tgpu.fn([d.vec2f])((vec) => {
          'use gpu';
          // oxlint-disable-next-line typegpu/no-invalid-assignment -- this is a test
          vec.xy = d.vec2f(1, 2);
        });

        expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:fn: 'vec.xy = d.vec2f(1, 2)' is invalid, because non-pointer arguments cannot be mutated.]
        `);
      });
    });

    it('disallows argument swizzle then swizzle assignment', () => {
      const fn = tgpu.fn([d.vec4f])((v) => {
        'use gpu';
        // oxlint-disable-next-line typegpu/no-invalid-assignment
        v.xy.yx = d.vec2f();
      });

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:fn: 'v.xy.yx = d.vec2f()' is invalid. Nested swizzle mutation is disallowed for JS consistency.]
      `);
    });

    it('disallows argument swizzle then prop argument assignment', () => {
      const fn = tgpu.fn([d.vec4f])((v) => {
        'use gpu';
        // oxlint-disable-next-line typegpu/no-invalid-assignment
        v.xy.x = 1;
      });

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:fn: 'v.xy.x = 1' is invalid. Nested swizzle mutation is disallowed for JS consistency.]
      `);
    });

    it('disallows argument swizzle then index argument assignment', () => {
      const fn = tgpu.fn([d.vec4f])((v) => {
        'use gpu';
        // oxlint-disable-next-line typegpu/no-invalid-assignment
        v.xy[0] = 1;
      });

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:fn: 'v.xy[0] = 1' is invalid. Nested swizzle mutation is disallowed for JS consistency.]
      `);
    });

    it('disallows argument swizzle then prop argument update', () => {
      const fn = tgpu.fn([d.vec4f])((v) => {
        'use gpu';
        // oxlint-disable-next-line typegpu/no-invalid-assignment
        v.xy.x++;
      });

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:fn: 'v.xy.x++' is invalid. Nested swizzle mutation is disallowed for JS consistency.]
      `);
    });

    it('correctly infers origin of a non-assigned lhs swizzle', () => {
      const fn = tgpu.fn([d.vec4f])((v) => {
        'use gpu';
        const t = [1, 2, 3];
        t[CAPTURE(v.xy).x] = 1;
      });

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1(v: vec4f) {
          var t = array<i32, 3>(1, 2, 3);
          t[u32(v.xy.x)] = 1i;
        }"
      `);
      expect(captureSnippets(fn)?.[0]?.origin).toBe('runtime'); // swizzle assignment would give 'argument'
    });
  });
});

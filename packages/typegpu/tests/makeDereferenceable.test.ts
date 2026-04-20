import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { snip, makeResolvable, makeDereferenceable } from 'typegpu/~internal';
import { it } from 'typegpu-testing-utility';

describe('makeDereferenceable', () => {
  it('should be resolved once and cached', () => {
    const spy = vi.fn();

    const intensity = makeDereferenceable(
      makeResolvable(
        {},
        {
          asString() {
            return 'intensity';
          },
          resolve(ctx) {
            spy();

            const name = ctx.makeUniqueIdentifier('intensity', 'global');
            ctx.addDeclaration(`@group(0) @binding(0) var<uniform> ${name}: f32;`);
            return snip(name, d.f32, /* origin */ 'uniform');
          },
        },
      ),
      {
        getDataTypeAndOrigin() {
          return [d.f32, 'uniform'];
        },
        getInJS(): number {
          throw new Error(`Cannot be used in JS.`);
        },
      },
    );

    function fn1() {
      'use gpu';
      return d.vec4f(0, intensity.$, 0, 1);
    }

    function fn2() {
      'use gpu';
      return d.vec4f(intensity.$, 0, 0, 1);
    }

    const resolved = tgpu.resolve([fn1, fn2]);

    expect(spy).toHaveBeenCalledOnce();

    expect(resolved).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> intensity: f32;

      fn fn1() -> vec4f {
        return vec4f(0f, intensity, 0f, 1f);
      }

      fn fn2() -> vec4f {
        return vec4f(intensity, 0f, 0f, 1f);
      }"
    `);
  });
});

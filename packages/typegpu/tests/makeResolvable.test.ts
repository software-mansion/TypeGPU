import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { snip, makeResolvable } from 'typegpu/~internal';
import { it } from 'typegpu-testing-utility';

describe('makeResolvable', () => {
  it('should be resolved once and cached', () => {
    const spy = vi.fn();

    const intensity = makeResolvable(
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
    );

    const fn1 = tgpu.fn([], d.vec4f)`() {
      return vec4f(0, intensity, 0, 1));
    }`.$uses({ intensity });

    const fn2 = tgpu.fn([], d.vec4f)`() {
      return vec4f(intensity, 0, 0, 1));
    }`.$uses({ intensity });

    const resolved = tgpu.resolve([fn1, fn2]);

    expect(spy).toHaveBeenCalledOnce();

    expect(resolved).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> intensity: f32;

      fn fn1() -> vec4f {
            return vec4f(0, intensity, 0, 1));
          }

      fn fn2() -> vec4f {
            return vec4f(intensity, 0, 0, 1));
          }"
    `);
  });
});

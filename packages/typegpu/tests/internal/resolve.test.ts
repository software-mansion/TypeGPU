import { describe, expect, vi } from 'vitest';
import tgpu, { d } from '../../src/index.js';
import { getName, setName } from '../../src/shared/meta.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../../src/shared/symbols.ts';
import type { ResolutionCtx } from '../../src/types.ts';
import { it } from 'typegpu-testing-utility';
import { snip } from '../../src/data/snippet.ts';

describe('resolution behavior', () => {
  it('should deduplicate dependencies', () => {
    const intensity = {
      [$internal]: true,

      [$gpuValueOf]: {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, d.f32, /* origin */ 'runtime');
        },
        [$resolve]: (ctx: ResolutionCtx) => ctx.resolve(intensity),
      } as unknown as number,

      [$resolve](ctx: ResolutionCtx) {
        const name = ctx.makeUniqueIdentifier(getName(this), 'global');
        ctx.addDeclaration(`@group(0) @binding(0) var<uniform> ${name}: f32;`);
        return snip(name, d.f32, /* origin */ 'runtime');
      },

      get $(): number {
        return this[$gpuValueOf];
      },
    };
    setName(intensity, 'intensity');

    const fragment1 = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(0, intensity.$, 0, 1));

    const fragment2 = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(intensity.$, 0, 0, 1));

    const resolved = tgpu.resolve([fragment1, fragment2], { names: 'strict' });

    expect(resolved).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> intensity: f32;

      @fragment fn fragment1() -> @location(0) vec4f {
        return vec4f(0f, intensity, 0f, 1f);
      }

      @fragment fn fragment2() -> @location(0) vec4f {
        return vec4f(intensity, 0f, 0f, 1f);
      }"
    `);
  });
});

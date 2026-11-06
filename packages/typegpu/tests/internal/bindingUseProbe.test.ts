import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { d, tgpu } from '../../src/index.js';
import { bindingUseProbe } from '../../src/core/resolve/bindingUse.ts';
import type { Namespace } from '../../src/core/resolve/namespace.ts';
import { getName } from '../../src/shared/meta.ts';
import { $internal } from '../../src/shared/symbols.ts';

/**
 * Lists the binding uses recorded in each cached instance of `item`,
 * which is exactly what gets replayed when the item is a cache hit.
 */
function cachedBindingUses(names: Namespace, item: object) {
  const instances = names[$internal].memoizedResolves.get(item) ?? [];
  return instances.map((instance) =>
    [...(instance.probes?.get(bindingUseProbe) ?? [])].map(
      (use) => `${getName(use.binding.resource)} @ ${use.entryStage}`,
    ),
  );
}

describe('bindingUseProbe', () => {
  it('replays stage-less uses when a utility first used by a vertex shader is reused by a regular function', ({
    root,
  }) => {
    const scale = root.createUniform(d.f32);

    const util = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return scale.$ * 2;
    });

    const main = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      'use gpu';
      return { pos: d.vec4f(util(), 0, 0, 1) };
    });

    const helper = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return util() + 1;
    });

    const names = tgpu['~unstable'].namespace();
    const { catchall } = tgpu.resolveWithContext([main, helper], { names });

    // The utility records the use without a stage, because the stage transform lives in
    // the vertex function's probe frame, not in the utility's own frame.
    expect(cachedBindingUses(names, util)).toMatchInlineSnapshot(`
      [
        [
          "scale @ none",
        ],
      ]
    `);
    // The vertex function's frame applied its transform when the utility's uses bubbled up.
    expect(cachedBindingUses(names, main)).toMatchInlineSnapshot(`
      [
        [
          "scale @ vertex",
        ],
      ]
    `);
    // The regular function hit the utility's cache and got the stage-less uses replayed.
    expect(cachedBindingUses(names, helper)).toMatchInlineSnapshot(`
      [
        [
          "scale @ none",
        ],
      ]
    `);

    // A stage-less use at the root means the binding has to stay visible to every stage.
    expect(catchall?.[1].layout.entries).toStrictEqual({ 0: { uniform: d.f32 } });
  });

  it('assigns the vertex stage when the cached utility is replayed inside a vertex shader', ({
    root,
  }) => {
    const scale = root.createUniform(d.f32);

    const util = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return scale.$ * 2;
    });

    const helper = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return util() + 1;
    });

    const main = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      'use gpu';
      return { pos: d.vec4f(util(), 0, 0, 1) };
    });

    const names = tgpu['~unstable'].namespace();
    // Regular function first this time, so the vertex shader is the one hitting the cache
    const { catchall } = tgpu.resolveWithContext([helper, main], { names });

    expect(cachedBindingUses(names, util)).toMatchInlineSnapshot(`
      [
        [
          "scale @ none",
        ],
      ]
    `);
    expect(cachedBindingUses(names, helper)).toMatchInlineSnapshot(`
      [
        [
          "scale @ none",
        ],
      ]
    `);
    expect(cachedBindingUses(names, main)).toMatchInlineSnapshot(`
      [
        [
          "scale @ vertex",
        ],
      ]
    `);
    expect(catchall?.[1].layout.entries).toStrictEqual({ 0: { uniform: d.f32 } });
  });

  it('only gives the binding vertex visibility when nothing outside a stage uses it', ({
    root,
  }) => {
    const scale = root.createUniform(d.f32);

    const util = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return scale.$ * 2;
    });

    const main = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      'use gpu';
      return { pos: d.vec4f(util(), 0, 0, 1) };
    });

    const names = tgpu['~unstable'].namespace();
    // `main` twice: the second resolve is a cache hit on the vertex function itself
    const { catchall } = tgpu.resolveWithContext([main, main], { names });

    expect(cachedBindingUses(names, util)).toMatchInlineSnapshot(`
      [
        [
          "scale @ none",
        ],
      ]
    `);
    expect(cachedBindingUses(names, main)).toMatchInlineSnapshot(`
      [
        [
          "scale @ vertex",
        ],
      ]
    `);
    expect(catchall?.[1].layout.entries).toStrictEqual({
      0: { uniform: d.f32, visibility: ['vertex'] },
    });
  });
});

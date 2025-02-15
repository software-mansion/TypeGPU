import { describe, expect, expectTypeOf } from 'vitest';
import tgpu, {
  MissingBindGroupsError,
  type TgpuFragmentFnShell,
  type TgpuVertexFnShell,
} from '../src';
import * as d from '../src/data';
import { it } from './utils/extendedIt';

describe('Inter-Stage Variables', () => {
  describe('Empty vertex output', () => {
    const emptyVert = tgpu['~unstable'].vertexFn({ out: {} }).does('');
    const emptyVertWithBuiltin = tgpu['~unstable']
      .vertexFn({ out: { pos: d.builtin.vertexIndex } })
      .does('');

    it('allows fragment functions to use a subset of the vertex output', ({
      root,
    }) => {
      const emptyFragment = tgpu['~unstable']
        .fragmentFn({ in: {}, out: {} })
        .does('');
      const emptyFragmentWithBuiltin = tgpu['~unstable']
        .fragmentFn({ in: { pos: d.builtin.position }, out: {} })
        .does('');

      // Using none of none
      const pipeline = root
        .withVertex(emptyVert, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none of none (builtins are erased from the vertex output)
      const pipeline2 = root
        .withVertex(emptyVertWithBuiltin, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none of none (builtins are ignored in the fragment input)
      const pipeline3 = root
        .withVertex(emptyVert, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using none of none (builtins are ignored in both input and output,
      // so their conflict of the `pos` key is fine)
      const pipeline4 = root
        .withVertex(emptyVertWithBuiltin, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      expect(pipeline).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();
      expect(pipeline4).toBeDefined();
    });

    it('rejects fragment functions that use non-existent vertex output', ({
      root,
    }) => {
      const fragment = tgpu['~unstable']
        .fragmentFn({ in: { a: d.vec3f, c: d.f32 }, out: {} })
        .does('');

      root
        .withVertex(emptyVert, {})
        // @ts-expect-error: Missing from vertex output
        .withFragment(fragment, {})
        .createPipeline();
    });
  });

  describe('Non-empty vertex output', () => {
    const vert = tgpu['~unstable']
      .vertexFn({ out: { a: d.vec3f, b: d.vec2f } })
      .does('');
    const vertWithBuiltin = tgpu['~unstable']
      .vertexFn({
        out: { a: d.vec3f, b: d.vec2f, pos: d.builtin.position },
      })
      .does('');

    it('allows fragment functions to use a subset of the vertex output', ({
      root,
    }) => {
      const emptyFragment = tgpu['~unstable']
        .fragmentFn({ in: {}, out: {} })
        .does('');
      const emptyFragmentWithBuiltin = tgpu['~unstable']
        .fragmentFn({ in: { pos: d.builtin.frontFacing }, out: {} })
        .does('');
      const fullFragment = tgpu['~unstable']
        .fragmentFn({ in: { a: d.vec3f, b: d.vec2f }, out: d.vec4f })
        .does('');

      // Using none
      const pipeline = root
        .withVertex(vert, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none (builtins are erased from the vertex output)
      const pipeline2 = root
        .withVertex(vertWithBuiltin, {})
        .withFragment(emptyFragment, {})
        .createPipeline();

      // Using none (builtins are ignored in the fragment input)
      const pipeline3 = root
        .withVertex(vert, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using none (builtins are ignored in both input and output,
      // so their conflict of the `pos` key is fine)
      const pipeline4 = root
        .withVertex(vertWithBuiltin, {})
        .withFragment(emptyFragmentWithBuiltin, {})
        .createPipeline();

      // Using all
      const pipeline5 = root
        .withVertex(vert, {})
        .withFragment(fullFragment, { format: 'rgba8unorm' })
        .createPipeline();

      expect(pipeline).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();
      expect(pipeline4).toBeDefined();
      expect(pipeline5).toBeDefined();
    });

    it('rejects fragment functions that use non-existent vertex output', ({
      root,
    }) => {
      const fragment = tgpu['~unstable']
        .fragmentFn({ in: { a: d.vec3f, c: d.f32 }, out: {} })
        .does('');

      // @ts-expect-error: Missing from vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });

    it('rejects fragment functions that use mismatched vertex output data types', ({
      root,
    }) => {
      const fragment = tgpu['~unstable']
        .fragmentFn({ in: { a: d.vec3f, b: d.f32 }, out: {} })
        .does('');

      // @ts-expect-error: Mismatched vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const utgpu = tgpu['~unstable'];

    const layout = tgpu
      .bindGroupLayout({ alpha: { uniform: d.f32 } })
      .$name('example-layout');

    const vertexFn = utgpu
      .vertexFn({ out: {} })
      .does('() { layout.bound.alpha; }')
      .$uses({ layout });

    const fragmentFn = utgpu
      .fragmentFn({ out: { out: d.vec4f } })
      .does('() {}');

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { out: { format: 'rgba8unorm' } })
      .createPipeline()
      // biome-ignore lint/suspicious/noExplicitAny: <not testing color attachment at this time>
      .withColorAttachment({ out: {} } as any);

    expect(() => pipeline.draw(6)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.draw(6)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'example-layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
    );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(
      tgpu['~unstable'].vertexFn({ in: {}, out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, {}>>();

    expectTypeOf(
      tgpu['~unstable'].vertexFn({ out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, {}>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ in: {}, out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();
  });
});

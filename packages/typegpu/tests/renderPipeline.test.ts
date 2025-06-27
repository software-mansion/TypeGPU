import { describe, expect, expectTypeOf, vi } from 'vitest';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';
import * as d from '../src/data/index.ts';
import tgpu, {
  MissingBindGroupsError,
  type TgpuFragmentFnShell,
  type TgpuRenderPipeline,
  type TgpuVertexFnShell,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';

describe('Inter-Stage Variables', () => {
  describe('Non-empty vertex output', () => {
    const vert = tgpu['~unstable'].vertexFn({
      out: { a: d.vec3f, b: d.vec2f },
    })('');
    const vertWithBuiltin = tgpu['~unstable'].vertexFn({
      out: { a: d.vec3f, b: d.vec2f, pos: d.builtin.position },
    })('');

    it('allows fragment functions to use a subset of the vertex output', ({ root }) => {
      const emptyFragment = tgpu['~unstable'].fragmentFn({ in: {}, out: {} })(
        '',
      );
      const emptyFragmentWithBuiltin = tgpu['~unstable'].fragmentFn({
        in: { pos: d.builtin.frontFacing },
        out: {},
      })('');
      const fullFragment = tgpu['~unstable'].fragmentFn({
        in: { a: d.vec3f, b: d.vec2f },
        out: d.vec4f,
      })('');

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

    it('rejects fragment functions that use non-existent vertex output', ({ root }) => {
      const fragment = tgpu['~unstable'].fragmentFn({
        in: { a: d.vec3f, c: d.f32 },
        out: {},
      })('');

      // @ts-expect-error: Missing from vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });

    it('rejects fragment functions that use mismatched vertex output data types', ({ root }) => {
      const fragment = tgpu['~unstable'].fragmentFn({
        in: { a: d.vec3f, b: d.f32 },
        out: {},
      })('');

      // @ts-expect-error: Mismatched vertex output
      root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
    });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const utgpu = tgpu['~unstable'];

    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const vertexFn = utgpu
      .vertexFn({ out: { pos: d.builtin.position } })(
        '() { layout.bound.alpha; }',
      )
      .$uses({ layout });

    const fragmentFn = utgpu.fragmentFn({ out: { out: d.vec4f } })('() {}');

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
      `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
    );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(
      tgpu['~unstable'].vertexFn({ in: {}, out: { pos: d.builtin.position } }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu['~unstable'].vertexFn({ out: { pos: d.builtin.position } }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ in: {}, out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();
  });

  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();
      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback);

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline>();

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites).toBeDefined();
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should create automatic query set when adding performance callback', ({ root, device }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();
      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback)
        .withColorAttachment({
          color: {
            view: {} as unknown as GPUTextureView,
            loadOp: 'clear',
            storeOp: 'store',
          },
        });

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBeDefined();

      if (timestampWrites?.querySet && 'count' in timestampWrites.querySet) {
        expect(timestampWrites.querySet.count).toBe(2);
      }

      (timestampWrites?.querySet as TgpuQuerySet<'timestamp'>).querySet;

      expect(device.mock.createQuerySet).toHaveBeenCalledWith({
        type: 'timestamp',
        count: 2,
      });
    });

    it('should replace previous performance callback', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback1)
        .withPerformanceCallback(callback2);

      expect(pipeline).toBeDefined();

      expect(pipeline[$internal].priors.performanceCallback).toBe(
        callback2,
      );
      expect(pipeline[$internal].priors.performanceCallback).not.toBe(
        callback1,
      );
    });

    it('should throw error if timestamp-query feature is not enabled', ({ root, device }) => {
      const originalFeatures = device.features;
      //@ts-ignore
      device.features = new Set();

      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();

      expect(() => {
        root
          .withVertex(vertexFn, {})
          .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
          .createPipeline()
          .withPerformanceCallback(callback);
      }).toThrow(
        'Performance callback requires the "timestamp-query" feature to be enabled on GPU device.',
      );

      //@ts-ignore
      device.features = originalFeatures;
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        });

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline>();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(querySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should add timestamp writes with raw GPU query set', ({ root, device }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const rawQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet: rawQuerySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        });

      expect(pipeline).toBeDefined();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(rawQuerySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(2);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(3);
    });

    it('should handle optional timestamp write indices', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline1 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
        });

      const pipeline2 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          endOfPassWriteIndex: 1,
        });

      const pipeline3 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
        });

      expect(pipeline1).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();

      expect(
        pipeline1[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBe(0);
      expect(pipeline1[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBeUndefined();

      expect(
        pipeline2[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline2[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBe(1);

      expect(
        pipeline3[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline3[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBeUndefined();
    });

    it('should setup timestamp writes in render pass descriptor', ({ root, commandEncoder }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 1,
          endOfPassWriteIndex: 2,
        })
        .withColorAttachment({
          color: {
            view: {} as unknown as GPUTextureView,
            loadOp: 'clear',
            storeOp: 'store',
          },
        });

      pipeline.draw(3);

      expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'pipeline',
          timestampWrites: {
            querySet: querySet.querySet,
            beginningOfPassWriteIndex: 1,
            endOfPassWriteIndex: 2,
          },
        }),
      );
    });
  });

  it('should handle depth stencil attachments with timestamp writes', ({ root, commandEncoder }) => {
    const vertexFn = tgpu['~unstable'].vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu['~unstable'].fragmentFn({
      out: { color: d.vec4f },
    })('');

    const querySet = root.createQuerySet('timestamp', 2);

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline()
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      })
      .withDepthStencilAttachment({
        view: {} as unknown as GPUTextureView,
        stencilLoadOp: 'load',
      });

    pipeline.draw(3);

    expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith(
      expect.objectContaining({
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      }),
    );
  });
});

import { describe, expect, expectTypeOf, vi } from 'vitest';
import { matchUpVaryingLocations } from '../../src/core/pipeline/renderPipeline.ts';
import type { TgpuQuerySet } from '../../src/core/querySet/querySet.ts';
import tgpu, { d, type TgpuRenderPipeline } from 'typegpu';
import { $internal } from '../../src/shared/symbols.ts';
import { it } from 'typegpu-testing-utility';

describe('root.withVertex(...).withFragment(...)', () => {
  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();
      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback);

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<{ color: d.Vec4f }>>();

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites).toBeDefined();
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should create automatic query set when adding performance callback', ({ root, device }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback2);
      expect(pipeline[$internal].priors.performanceCallback).not.toBe(callback1);
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<{ color: d.Vec4f }>>();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(querySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should add timestamp writes with raw GPU query set', ({ root, device }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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

      expect(pipeline1[$internal].priors.timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(pipeline1[$internal].priors.timestampWrites?.endOfPassWriteIndex).toBeUndefined();

      expect(
        pipeline2[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline2[$internal].priors.timestampWrites?.endOfPassWriteIndex).toBe(1);

      expect(
        pipeline3[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline3[$internal].priors.timestampWrites?.endOfPassWriteIndex).toBeUndefined();
    });
  });

  it('should handle a combination of timestamp writes, index buffer, and performance callback', ({
    root,
    device,
    commandEncoder,
  }) => {
    const vertexFn = tgpu
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');
    const beginRenderPassSpy = vi.spyOn(commandEncoder, 'beginRenderPass');
    const resolveQuerySetSpy = vi.spyOn(commandEncoder, 'resolveQuerySet');

    const callback = vi.fn();

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline()
      .withIndexBuffer(indexBuffer)
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withPerformanceCallback(callback)
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    expect(pipeline[$internal].priors.indexBuffer).toEqual({
      buffer: indexBuffer,
      indexFormat: 'uint16',
      offsetBytes: undefined,
      sizeBytes: undefined,
    });
    expect(pipeline[$internal].priors.timestampWrites).toEqual({
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    });
    expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

    pipeline.drawIndexed(3);

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'timestamp',
      count: 2,
    });

    expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          view: expect.any(Object),
        },
      ],
      label: 'pipeline',
      timestampWrites: {
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
        querySet: querySet.querySet,
      },
    });

    expect(resolveQuerySetSpy).toHaveBeenCalledWith(
      querySet.querySet,
      0,
      2,
      querySet[$internal].resolveBuffer,
      0,
    );

    expect(beginRenderPassSpy).toHaveBeenCalledWith({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          view: expect.any(Object),
        },
      ],
      label: 'pipeline',
      timestampWrites: {
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
        querySet: querySet.querySet,
      },
    });
  });
});

describe('matchUpVaryingLocations', () => {
  it('works for empty arguments', () => {
    expect(matchUpVaryingLocations({}, {}, 'v', 'f')).toStrictEqual({});
  });

  it('works for empty fragment', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
        },
        undefined,
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 0,
    });
  });

  it('works for non-empty', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
        },
        {
          a: d.u32,
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 0,
    });
  });

  it('works with unused vertex attributes', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.u32,
          c: d.u32,
        },
        {
          b: d.u32,
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 0,
      b: 1,
      c: 2,
    });
  });

  it('works with custom locations in vertex out', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.location(5, d.u32),
          c: d.u32,
        },
        {
          b: d.u32,
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 0,
      b: 5,
      c: 1,
    });
  });

  it('works with custom locations in fragment in', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.u32,
          c: d.u32,
        },
        {
          b: d.u32,
          c: d.location(0, d.u32),
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 1,
      b: 2,
      c: 0,
    });
  });

  it('works with custom locations in both', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.location(1, d.u32),
          c: d.u32,
        },
        {
          b: d.u32,
          c: d.location(0, d.u32),
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in vertex out', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.location(1, d.u32),
          c: d.u32,
          d: d.builtin.position,
        },
        {
          b: d.u32,
          c: d.location(0, d.u32),
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in fragment in', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          b: d.location(1, d.u32),
          c: d.u32,
        },
        {
          b: d.u32,
          c: d.location(0, d.u32),
          d: d.builtin.position,
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in both', () => {
    expect(
      matchUpVaryingLocations(
        {
          a: d.u32,
          d: d.builtin.position,
          b: d.location(1, d.u32),
          c: d.u32,
        },
        {
          d: d.builtin.position,
          b: d.u32,
          c: d.location(0, d.u32),
        },
        'v',
        'f',
      ),
    ).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });
});

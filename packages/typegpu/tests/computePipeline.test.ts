import { describe, expect, expectTypeOf, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, {
  MissingBindGroupsError,
  type TgpuComputeFnShell,
  type TgpuComputePipeline,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = tgpu['~unstable']
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      })
      .$name('main');

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline()
      .$name('test_pipeline');

    expectTypeOf(computePipeline).toEqualTypeOf<TgpuComputePipeline>();

    root.unwrap(computePipeline);

    expect(root.device.createComputePipeline).toBeCalledWith({
      compute: {
        module: device.mock.createShaderModule(),
      },
      label: 'test_pipeline',
      layout: device.mock.createPipelineLayout(),
    });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const layout = tgpu
      .bindGroupLayout({ alpha: { uniform: d.f32 } })
      .$name('example-layout');

    const entryFn = tgpu['~unstable']
      .computeFn({ workgroupSize: [1] })(() => {
        layout.bound.alpha; // Using an entry of the layout
      })
      .$name('main');

    const pipeline = root.withCompute(entryFn).createPipeline();

    expect(() => pipeline.dispatchWorkgroups(1)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.dispatchWorkgroups(1))
      .toThrowErrorMatchingInlineSnapshot(
        `[Error: Missing bind groups for layouts: 'example-layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
      );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(
      tgpu['~unstable'].computeFn({ in: {}, workgroupSize: [1] }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuComputeFnShell<{}>>();

    expectTypeOf(
      tgpu['~unstable'].computeFn({ workgroupSize: [1] }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuComputeFnShell<{}>>();
  });

  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const callback = vi.fn();
      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withPerformanceCallback(callback);

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuComputePipeline>();

      expect(pipeline[$internal].priors.withPerformanceCallback).toBe(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites).toBeDefined();
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should create automatic query set when adding performance Callback', ({ root, device }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const Callback = vi.fn();
      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withPerformanceCallback(Callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBeDefined();
      expect(timestampWrites?.querySet.count).toBe(2);

      (timestampWrites?.querySet as TgpuQuerySet<'timestamp'>).querySet;
      expect(device.mock.createQuerySet).toHaveBeenCalledWith({
        type: 'timestamp',
        count: 2,
      });
    });

    it('should replace previous performance Callback', ({ root }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withPerformanceCallback(callback1)
        .withPerformanceCallback(callback2);

      expect(pipeline).toBeDefined();

      expect(pipeline[$internal].priors.withPerformanceCallback).toBe(
        callback2,
      );
      expect(pipeline[$internal].priors.withPerformanceCallback).not.toBe(
        callback1,
      );
    });

    it('should throw error if timestamp-query feature is not enabled', ({ root, device }) => {
      const originalFeatures = device.features;
      //@ts-ignore
      device.features = new Set();

      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const Callback = vi.fn();

      expect(() => {
        root
          .withCompute(entryFn)
          .createPipeline()
          .withPerformanceCallback(Callback);
      }).toThrow(
        'Performance Callback requires the "timestamp-query" feature to be enabled on GPU device.',
      );

      //@ts-ignore
      device.features = originalFeatures;
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        });

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuComputePipeline>();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(querySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should add timestamp writes with raw GPU query set', ({ root, device }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const rawQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });

      const pipeline = root
        .withCompute(entryFn)
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
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline1 = root
        .withCompute(entryFn)
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
        });

      const pipeline2 = root
        .withCompute(entryFn)
        .createPipeline()
        .withTimestampWrites({
          querySet,
          endOfPassWriteIndex: 1,
        });

      const pipeline3 = root
        .withCompute(entryFn)
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

    it('should setup timestamp writes in compute pass descriptor', ({ root, commandEncoder }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 1,
          endOfPassWriteIndex: 2,
        });

      pipeline.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: '<unnamed>',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 1,
          endOfPassWriteIndex: 2,
        },
      });
    });

    it('should work with bind groups and timestamp writes regardless of call order', ({ root, commandEncoder }) => {
      const layout = tgpu.bindGroupLayout({
        data: { uniform: d.f32 },
      });

      const buffer = root.createBuffer(d.f32).$usage('uniform');
      buffer.write(42.0);

      const bindGroup = root.createBindGroup(layout, {
        data: buffer,
      });

      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {
          layout.bound.data;
        })
        .$uses({ layout })
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline().withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        })
        .with(layout, bindGroup);

      const pipeline2 = root
        .withCompute(entryFn)
        .createPipeline()
        .with(layout, bindGroup)
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        });

      pipeline.dispatchWorkgroups(1);
      pipeline2.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: '<unnamed>',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: '<unnamed>',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        },
      });
    });
  });

  describe('Combined Performance Callback and Timestamp Writes', () => {
    it('should work with both performance Callback and custom timestamp writes', ({ root, commandEncoder }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 10);
      const Callback = vi.fn();

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 3,
          endOfPassWriteIndex: 7,
        })
        .withPerformanceCallback(Callback);

      const priors = pipeline[$internal].priors;
      expect(priors.withPerformanceCallback).toBe(Callback);
      expect(priors.timestampWrites?.querySet).toBe(querySet);
      expect(priors.timestampWrites?.beginningOfPassWriteIndex).toBe(3);
      expect(priors.timestampWrites?.endOfPassWriteIndex).toBe(7);

      pipeline.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: '<unnamed>',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 3,
          endOfPassWriteIndex: 7,
        },
      });

      expect(commandEncoder.resolveQuerySet).toHaveBeenCalledWith(
        querySet.querySet,
        0,
        10,
        querySet[$internal].resolveBuffer,
        0,
      );
    });

    it('should prioritize custom timestamp writes over automatic ones', ({ root, commandEncoder }) => {
      const entryFn = tgpu['~unstable']
        .computeFn({ workgroupSize: [1] })(() => {})
        .$name('main');

      const querySet = root.createQuerySet('timestamp', 8);
      const Callback = vi.fn();

      let pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withPerformanceCallback(Callback);

      const autoQuerySet = pipeline[$internal].priors.timestampWrites?.querySet;

      pipeline = pipeline.withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 2,
        endOfPassWriteIndex: 5,
      });

      expect((autoQuerySet as TgpuQuerySet<'timestamp'>).destroyed).toBe(true);

      const priors = pipeline[$internal].priors;
      expect(priors.withPerformanceCallback).toBe(Callback);
      expect(priors.timestampWrites?.querySet).toBe(querySet);
      expect(priors.timestampWrites?.beginningOfPassWriteIndex).toBe(2);
      expect(priors.timestampWrites?.endOfPassWriteIndex).toBe(5);

      pipeline.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: '<unnamed>',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 5,
        },
      });
    });
  });
});

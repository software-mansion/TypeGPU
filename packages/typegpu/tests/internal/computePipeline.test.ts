import { describe, expect, expectTypeOf, vi } from 'vitest';
import type { TgpuQuerySet } from '../../src/core/querySet/querySet.ts';
import { tgpu, type TgpuComputePipeline } from 'typegpu';
import { $internal } from '../../src/shared/symbols.ts';
import { it } from 'typegpu-testing-utility';

describe('TgpuComputePipeline', () => {
  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const callback = vi.fn();
      const pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withPerformanceCallback(callback);

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<TgpuComputePipeline>();

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites).toBeDefined();
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should create automatic query set when adding performance callback', ({ root, device }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const callback = vi.fn();
      const pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withPerformanceCallback(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBeDefined();
      expect(timestampWrites?.querySet.count).toBe(2);

      (timestampWrites?.querySet as TgpuQuerySet<'timestamp'>).querySet;
      expect(device.mock.createQuerySet).toHaveBeenCalledWith({
        type: 'timestamp',
        count: 2,
      });
    });

    it('should replace previous performance callback', ({ root }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withPerformanceCallback(callback1)
        .withPerformanceCallback(callback2);

      expect(pipeline).toBeDefined();

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback2);
      expect(pipeline[$internal].priors.performanceCallback).not.toBe(callback1);
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root.createComputePipeline({ compute: entryFn }).withTimestampWrites({
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const rawQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });

      const pipeline = root.createComputePipeline({ compute: entryFn }).withTimestampWrites({
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline1 = root.createComputePipeline({ compute: entryFn }).withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
      });

      const pipeline2 = root.createComputePipeline({ compute: entryFn }).withTimestampWrites({
        querySet,
        endOfPassWriteIndex: 1,
      });

      const pipeline3 = root.createComputePipeline({ compute: entryFn }).withTimestampWrites({
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

  describe('Combined Performance callback and Timestamp Writes', () => {
    it('should work with both performance callback and custom timestamp writes', ({
      root,
      device,
      commandEncoder,
    }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const querySet = root.createQuerySet('timestamp', 10);
      const callback = vi.fn();

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 3,
          endOfPassWriteIndex: 7,
        })
        .withPerformanceCallback(callback);

      const priors = pipeline[$internal].priors;
      expect(priors.performanceCallback).toBe(callback);
      expect(priors.timestampWrites?.querySet).toBe(querySet);
      expect(priors.timestampWrites?.beginningOfPassWriteIndex).toBe(3);
      expect(priors.timestampWrites?.endOfPassWriteIndex).toBe(7);

      pipeline.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: 'pipeline',
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

      expect(device.mock.createQuerySet).toHaveBeenCalledTimes(1);
      expect(device.mock.createQuerySet).toHaveBeenCalledWith({
        type: 'timestamp',
        count: 10,
      });
    });

    it('should prioritize custom timestamp writes over automatic ones', ({
      root,
      commandEncoder,
    }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});

      const querySet = root.createQuerySet('timestamp', 8);
      const callback = vi.fn();

      let pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withPerformanceCallback(callback);

      const autoQuerySet = pipeline[$internal].priors.timestampWrites?.querySet;

      pipeline = pipeline.withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 2,
        endOfPassWriteIndex: 5,
      });

      const priors = pipeline[$internal].priors;
      expect(priors.performanceCallback).toBe(callback);
      expect(priors.timestampWrites?.querySet).toBe(querySet);
      expect(priors.timestampWrites?.beginningOfPassWriteIndex).toBe(2);
      expect(priors.timestampWrites?.endOfPassWriteIndex).toBe(5);

      pipeline.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: 'pipeline',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 5,
        },
      });
    });
  });
});

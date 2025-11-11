import { describe, expect, expectTypeOf, vi } from 'vitest';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';
import * as d from '../src/data/index.ts';
import tgpu, {
  MissingBindGroupsError,
  type TgpuComputePipeline,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';
import { asWgsl } from './utils/parseResolved.ts';
import { extensionEnabled } from '../src/std/extensions.ts';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [32] })(() => {
      // do something
    });

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline();

    expectTypeOf(computePipeline).toEqualTypeOf<TgpuComputePipeline>();

    root.unwrap(computePipeline);

    expect(root.device.createComputePipeline).toBeCalledWith({
      compute: {
        module: device.mock.createShaderModule(),
      },
      label: 'computePipeline',
      layout: device.mock.createPipelineLayout(),
    });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
      layout.bound.alpha; // Using an entry of the layout
    });

    const pipeline = root.withCompute(entryFn).createPipeline();

    expect(() => pipeline.dispatchWorkgroups(1)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.dispatchWorkgroups(1))
      .toThrowErrorMatchingInlineSnapshot(
        `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(bindGroup).(...)]`,
      );
  });

  it('is resolvable', ({ root }) => {
    const main = tgpu['~unstable']
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      });

    const computePipeline = root
      .withCompute(main)
      .createPipeline();

    expect(asWgsl(computePipeline)).toMatchInlineSnapshot(`
      "@compute @workgroup_size(32) fn main() {

      }"
    `);
  });

  it('type checks passed bind groups', ({ root }) => {
    const main = tgpu['~unstable']
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      });
    const computePipeline = root
      .withCompute(main)
      .createPipeline();

    const layout1 = tgpu.bindGroupLayout({ buf: { uniform: d.u32 } });
    const bindGroup1 = root.createBindGroup(layout1, {
      buf: root.createBuffer(d.u32).$usage('uniform'),
    });
    const layout2 = tgpu.bindGroupLayout({ buf: { uniform: d.f32 } });
    const bindGroup2 = root.createBindGroup(layout2, {
      buf: root.createBuffer(d.f32).$usage('uniform'),
    });

    computePipeline.with(layout1, bindGroup1);
    computePipeline.with(layout2, bindGroup2);
    //@ts-expect-error
    (() => computePipeline.with(layout1, bindGroup2));
  });

  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback = vi.fn();
      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
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
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback = vi.fn();
      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
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
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .withCompute(entryFn)
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
      //@ts-expect-error
      device.features = new Set();

      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback = vi.fn();

      expect(() => {
        root
          .withCompute(entryFn)
          .createPipeline()
          .withPerformanceCallback(callback);
      }).toThrow(
        'Performance callback requires the "timestamp-query" feature to be enabled on GPU device.',
      );

      //@ts-expect-error
      device.features = originalFeatures;
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
        label: 'pipeline',
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
        .$uses({ layout });

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline().withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        })
        .with(bindGroup);

      const pipeline2 = root
        .withCompute(entryFn)
        .createPipeline()
        .with(bindGroup)
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        });

      pipeline.dispatchWorkgroups(1);
      pipeline2.dispatchWorkgroups(1);

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: 'pipeline',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });

      expect(commandEncoder.beginComputePass).toHaveBeenCalledWith({
        label: 'pipeline2',
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        },
      });
    });
  });

  describe('Combined Performance callback and Timestamp Writes', () => {
    it('should work with both performance callback and custom timestamp writes', ({ root, commandEncoder }) => {
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const querySet = root.createQuerySet('timestamp', 10);
      const callback = vi.fn();

      const pipeline = root
        .withCompute(entryFn)
        .createPipeline()
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
    });

    it('should prioritize custom timestamp writes over automatic ones', ({ root, commandEncoder }) => {
      const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const querySet = root.createQuerySet('timestamp', 8);
      const callback = vi.fn();

      let pipeline = root
        .withCompute(entryFn)
        .createPipeline()
        .withPerformanceCallback(callback);

      const autoQuerySet = pipeline[$internal].priors.timestampWrites?.querySet;

      pipeline = pipeline.withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 2,
        endOfPassWriteIndex: 5,
      });

      expect((autoQuerySet as TgpuQuerySet<'timestamp'>).destroyed).toBe(true);

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

  it('enables language extensions when their corresponding feature is enabled', ({ root, device }) => {
    Object.defineProperty(root, 'enabledFeatures', {
      value: new Set<GPUFeatureName>(['shader-f16', 'subgroups']),
      writable: true,
    });

    const fn = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [1],
    })(({ gid }) => {
      const a = d.arrayOf(d.f32, 3)();
    });

    const pipeline = root['~unstable'].withCompute(fn).createPipeline();

    pipeline.dispatchWorkgroups(1);

    expect(
      (device.mock.createShaderModule.mock.calls[0] as {
        label?: string;
        code: string;
      }[])[0]?.code,
    ).toMatchInlineSnapshot(`
      "enable f16;
      enable subgroups;

      struct fn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_0(_arg_0: fn_Input_1) {
        var a = array<f32, 3>();
      }"
    `);
  });

  it('performs extension based pruning', ({ root, device }) => {
    Object.defineProperty(root, 'enabledFeatures', {
      value: new Set<GPUFeatureName>(['shader-f16', 'subgroups']),
      writable: true,
    });

    const fn = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [1],
    })(({ gid }) => {
      const a = d.arrayOf(d.f16, 3)();
      if (extensionEnabled('subgroups')) {
        a[0] = gid.x;
      }
      if (extensionEnabled('f16')) {
        a[1] = d.f16(1.0);
      }
      if (extensionEnabled('primitive_index')) {
        a[2] = d.f16(2.0);
      }
    });

    const pipeline = root['~unstable'].withCompute(fn).createPipeline();

    pipeline.dispatchWorkgroups(1);

    expect(
      (device.mock.createShaderModule.mock.calls[0] as {
        label?: string;
        code: string;
      }[])[0]?.code,
    ).toMatchInlineSnapshot(`
      "enable f16;
      enable subgroups;

      struct fn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_0(_arg_0: fn_Input_1) {
        var a = array<f16, 3>();
        {
          a[0] = f16(_arg_0.gid.x);
        }
        {
          a[1] = 1h;
        }

      }"
    `);
  });
});

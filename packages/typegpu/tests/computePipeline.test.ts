import { describe, expect, expectTypeOf, vi } from 'vitest';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';
import {
  d,
  MissingBindGroupsError,
  tgpu,
  type TgpuComputePipeline,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';
import { extensionEnabled } from '../src/std/extensions.ts';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = tgpu.computeFn({ workgroupSize: [32] })(() => {
      // do something
    });

    const computePipeline = root.createComputePipeline({
      compute: entryFn,
    });

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

    const entryFn = tgpu.computeFn({ workgroupSize: [1] })(() => {
      layout.$.alpha; // Using an entry of the layout
    });

    const pipeline = root.createComputePipeline({
      compute: entryFn,
    });

    expect(() => pipeline.dispatchWorkgroups(1)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.dispatchWorkgroups(1))
      .toThrowErrorMatchingInlineSnapshot(
        `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(bindGroup).(...)]`,
      );
  });

  it('is resolvable', ({ root }) => {
    const main = tgpu
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      });

    const computePipeline = root.createComputePipeline({
      compute: main,
    });

    expect(tgpu.resolve([computePipeline])).toMatchInlineSnapshot(`
      "@compute @workgroup_size(32) fn main() {

      }"
    `);
  });

  it('type checks passed bind groups', ({ root }) => {
    const main = tgpu
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      });
    const computePipeline = root.createComputePipeline({
      compute: main,
    });

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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
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

      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const callback = vi.fn();

      expect(() => {
        root
          .createComputePipeline({ compute: entryFn })
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const rawQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline1 = root
        .createComputePipeline({ compute: entryFn })
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
        });

      const pipeline2 = root
        .createComputePipeline({ compute: entryFn })
        .withTimestampWrites({
          querySet,
          endOfPassWriteIndex: 1,
        });

      const pipeline3 = root
        .createComputePipeline({ compute: entryFn })
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
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

      const entryFn = tgpu
        .computeFn({ workgroupSize: [1] })(() => {
          layout.$.data;
        })
        .$uses({ layout });

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .createComputePipeline({ compute: entryFn })
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        })
        .with(bindGroup);

      const pipeline2 = root
        .createComputePipeline({ compute: entryFn })
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
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

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
    });

    it('should prioritize custom timestamp writes over automatic ones', ({ root, commandEncoder }) => {
      const entryFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );

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

    const fn = tgpu.computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [1],
    })(({ gid }) => {
      const a = d.arrayOf(d.f32, 3)();
    });

    const pipeline = root.createComputePipeline({ compute: fn });

    pipeline.dispatchWorkgroups(1);

    expect(
      (device.mock.createShaderModule.mock.calls[0] as {
        label?: string;
        code: string;
      }[])[0]?.code,
    ).toMatchInlineSnapshot(`
      "enable f16;
      enable subgroups;

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        var a = array<f32, 3>();
      }"
    `);
  });

  it('performs extension based pruning', ({ root, device }) => {
    Object.defineProperty(root, 'enabledFeatures', {
      value: new Set<GPUFeatureName>(['shader-f16', 'subgroups']),
      writable: true,
    });

    const fn = tgpu.computeFn({
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

    const pipeline = root.createComputePipeline({ compute: fn });

    pipeline.dispatchWorkgroups(1);

    expect(
      (device.mock.createShaderModule.mock.calls[0] as {
        label?: string;
        code: string;
      }[])[0]?.code,
    ).toMatchInlineSnapshot(`
      "enable f16;
      enable subgroups;

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        var a = array<f16, 3>();
        {
          a[0i] = f16(_arg_0.gid.x);
        }
        {
          a[1i] = 1h;
        }
      }"
    `);
  });

  it('warns when buffer limits are exceeded', ({ root }) => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
      () => {},
    );

    const uniform1 = root.createUniform(d.u32);
    const uniform2 = root.createUniform(d.u32);
    const uniform3 = root.createUniform(d.u32);
    const uniform4 = root.createUniform(d.u32);
    const uniform5 = root.createUniform(d.u32);
    const uniform6 = root.createUniform(d.u32);
    const uniform7 = root.createUniform(d.u32);
    const uniform8 = root.createUniform(d.u32);
    const uniform9 = root.createUniform(d.u32);
    const uniform10 = root.createUniform(d.u32);
    const uniform11 = root.createUniform(d.u32);
    const uniform12 = root.createUniform(d.u32);
    const uniform13 = root.createUniform(d.u32);

    const readonly1 = root.createReadonly(d.u32);
    const readonly2 = root.createReadonly(d.u32);
    const readonly3 = root.createReadonly(d.u32);
    const readonly4 = root.createReadonly(d.u32);
    const readonly5 = root.createReadonly(d.u32);
    const readonly6 = root.createReadonly(d.u32);
    const readonly7 = root.createReadonly(d.u32);
    const readonly8 = root.createReadonly(d.u32);
    const readonly9 = root.createReadonly(d.u32);

    const pipeline = root.createGuardedComputePipeline(() => {
      'use gpu';
      let a = d.u32();
      a = uniform1.$;
      a = uniform2.$;
      a = uniform3.$;
      a = uniform4.$;
      a = uniform5.$;
      a = uniform6.$;
      a = uniform7.$;
      a = uniform8.$;
      a = uniform9.$;
      a = uniform10.$;
      a = uniform11.$;
      a = uniform12.$;
      a = uniform13.$;
      a = readonly1.$;
      a = readonly2.$;
      a = readonly3.$;
      a = readonly4.$;
      a = readonly5.$;
      a = readonly6.$;
      a = readonly7.$;
      a = readonly8.$;
      a = readonly9.$;
    });

    pipeline.dispatchThreads();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Total number of uniform buffers (14) exceeds maxUniformBuffersPerShaderStage (12). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Total number of storage buffers (9) exceeds maxStorageBuffersPerShaderStage (8).`,
    );
  });
});

import { beforeEach, describe, expect, vi } from 'vitest';
import { namespace } from '../../src/core/resolve/namespace.ts';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { deserializeAndStringify } from '../../src/tgsl/consoleLog/deserializers.ts';
import { CodegenState } from '../../src/types.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('wgslGenerator with console.log', () => {
  let ctx: ResolutionCtxImpl;
  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      namespace: namespace({ names: 'strict' }),
    });
    ctx.pushMode(new CodegenState());
  });

  it('Parses console.log in a stray function to a comment and warns', ({ root }) => {
    using consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const fn = tgpu.fn([])(() => {
      console.log(987);
    });

    expect(asWgsl(fn)).toMatchInlineSnapshot(`
      "fn fn_1() {
        /* console.log() */;
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "'console.log' is currently only supported in compute pipelines.",
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('Parses a single console.log in a render pipeline', ({ root }) => {
    const vs = tgpu['~unstable']
      .vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
    const fs = tgpu['~unstable']
      .fragmentFn({ out: d.vec4f })(() => {
        console.log(d.u32(321));
        return d.vec4f();
      });

    const pipeline = root['~unstable']
      .withVertex(vs, {})
      .withFragment(fs, { format: 'rg8unorm' })
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "struct vs_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vs() -> vs_Output {
        return vs_Output(vec4f());
      }

      fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      fn log1(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer, 1);
        if (index >= 64) {
          return;
        }
        dataBuffer[index].id = 1;

        var serializedData0 = serializeU32(_arg_0);
        dataBuffer[index].serializedData[0] = serializedData0[0];
      }

      @fragment fn fs() -> @location(0) vec4f {
        log1(321);
        return vec4f();
      }"
    `);
  });

  it('Parses a single console.log in a compute pipeline', ({ root }) => {
    const fn = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(d.u32(10));
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      fn log1(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer, 1);
        if (index >= 64) {
          return;
        }
        dataBuffer[index].id = 1;

        var serializedData0 = serializeU32(_arg_0);
        dataBuffer[index].serializedData[0] = serializedData0[0];
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10);
      }"
    `);
  });

  it('Parses two console.logs in a compute pipeline', ({ root }) => {
    const fn = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(d.u32(10));
      console.log(d.u32(20));
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      fn log1(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer, 1);
        if (index >= 64) {
          return;
        }
        dataBuffer[index].id = 1;

        var serializedData0 = serializeU32(_arg_0);
        dataBuffer[index].serializedData[0] = serializedData0[0];
      }

      fn log2(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer, 1);
        if (index >= 64) {
          return;
        }
        dataBuffer[index].id = 2;

        var serializedData0 = serializeU32(_arg_0);
        dataBuffer[index].serializedData[0] = serializedData0[0];
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10);
        log2(20);
      }"
    `);
  });

  it('Parses console.logs with more arguments in a compute pipeline', ({ root }) => {
    const fn = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(
        'string arguments should be omitted in wgsl',
        d.u32(10),
        d.vec3u(2, 3, 4),
        d.u32(50),
      );
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn serializeVec3u(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      fn log1(_arg_0: u32, _arg_1: vec3u, _arg_2: u32) {
        var index = atomicAdd(&indexBuffer, 1);
        if (index >= 64) {
          return;
        }
        dataBuffer[index].id = 1;

        var serializedData0 = serializeU32(_arg_0);
        dataBuffer[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeVec3u(_arg_1);
        dataBuffer[index].serializedData[1] = serializedData1[0];
        dataBuffer[index].serializedData[2] = serializedData1[1];
        dataBuffer[index].serializedData[3] = serializedData1[2];
        var serializedData2 = serializeU32(_arg_2);
        dataBuffer[index].serializedData[4] = serializedData2[0];
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10, vec3u(2, 3, 4), 50);
      }"
    `);
  });

  it('Throws when not enough space to serialize console.log', ({ root }) => {
    const fn = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      // default limit is 252 bytes
      console.log(
        d.vec4u(912, 913, 914, 915),
        d.vec4u(922, 923, 924, 925),
        d.vec4u(932, 933, 934, 935),
        d.vec4u(942, 943, 944, 945),
        d.vec4u(812, 813, 814, 815),
        d.vec4u(822, 823, 824, 825),
        d.vec4u(832, 833, 834, 835),
        d.vec4u(842, 843, 844, 845),
        d.vec4u(712, 713, 714, 715),
        d.vec4u(722, 723, 724, 725),
        d.vec4u(732, 733, 734, 735),
        d.vec4u(742, 743, 744, 745),
        d.vec4u(612, 613, 614, 615),
        d.vec4u(622, 623, 624, 625),
        d.vec4u(632, 633, 634, 635),
        d.vec4u(642, 643, 644, 645),
      );
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(() => asWgsl(pipeline)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - computePipeline:pipeline
      - computePipelineCore
      - computeFn:fn
      - fn:consoleLog: Logged data needs to fit in 252 bytes (one of the logs requires 256 bytes). Consider increasing the limit by passing appropriate options to tgpu.init().]
    `);
  });
});

describe('deserializeAndStringify', () => {
  it('works for string literals', () => {
    const data: number[] = [];
    const logInfo: (string | d.AnyWgslData)[] = ['String literal'];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `"String literal"`,
    );
  });

  it('works for u32', () => {
    const data: number[] = [123];
    const logInfo: (string | d.AnyWgslData)[] = [d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `"123"`,
    );
  });

  it('works for vec3u', () => {
    const data: number[] = [1, 2, 3];
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `"vec3u(1, 2, 3)"`,
    );
  });

  it('works for clumped vectors', () => {
    const data: number[] = [1, 2, 3, 4, 5, 6]; // no alignment
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u, d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `"vec3u(1, 2, 3) vec3u(4, 5, 6)"`,
    );
  });

  it('works for multiple arguments', () => {
    const data: number[] = [1, 2, 3, 456];
    const logInfo: (string | d.AnyWgslData)[] = [
      'GID:',
      d.vec3u,
      'Result:',
      d.u32,
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `"GID: vec3u(1, 2, 3) Result: 456"`,
    );
  });
});

import { beforeEach, describe, expect, vi } from 'vitest';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { StrictNameRegistry } from '../../src/nameRegistry.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { deserializeAndStringify } from '../../src/tgsl/log/deserializers.ts';
import { CodegenState } from '../../src/types.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('wgslGenerator with console.log', () => {
  let ctx: ResolutionCtxImpl;
  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
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
      "fn fn() {
        /* console.log() */;
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "'console.log' is currently only supported in compute pipelines.",
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('Parses console.log in render pipeline to a comment and warns', ({ root }) => {
    using consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const vs = tgpu['~unstable']
      .vertexFn({ out: { pos: d.builtin.position } })(() => {
        console.log(654);
        return { pos: d.vec4f() };
      });
    const fs = tgpu['~unstable']
      .fragmentFn({ out: d.vec4f })(() => {
        console.log(321);
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
        /* console.log() */;
        return vs_Output(vec4f());
      }

      @fragment fn fs() -> @location(0) vec4f {
        /* console.log() */;
        return vec4f();
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "'console.log' is currently only supported in compute pipelines.",
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
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
      "struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> dataIndexBuffer: atomic<u32>;

      struct log data schema {
        id: u32,
        data: array<u32, 64>,
      }

      @group(0) @binding(1) var<storage, read_write> log buffer: array<log data schema, 256>;

      fn log data 1 serializer(_arg_0: u32) {
          var dataIndex = atomicAdd(&dataIndexBuffer, 1);
          log buffer[dataIndex].id = 1;


          var serializedData_0 = serializeU32(_arg_0);
          for (var i = 0u; i< 1u; i++) {
            log buffer[dataIndex].data[i] = serializedData_0[i - 0];
          }

          
        }

      @compute @workgroup_size(1) fn fn(_arg_0: fn_Input) {
        log data 1 serializer(10);
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
      "struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> dataIndexBuffer: atomic<u32>;

      struct log data schema {
        id: u32,
        data: array<u32, 64>,
      }

      @group(0) @binding(1) var<storage, read_write> log buffer: array<log data schema, 256>;

      fn log data 1 serializer(_arg_0: u32) {
          var dataIndex = atomicAdd(&dataIndexBuffer, 1);
          log buffer[dataIndex].id = 1;


          var serializedData_0 = serializeU32(_arg_0);
          for (var i = 0u; i< 1u; i++) {
            log buffer[dataIndex].data[i] = serializedData_0[i - 0];
          }

          
        }

      fn log data 2 serializer(_arg_0: u32) {
          var dataIndex = atomicAdd(&dataIndexBuffer, 1);
          log buffer[dataIndex].id = 2;


          var serializedData_0 = serializeU32(_arg_0);
          for (var i = 0u; i< 1u; i++) {
            log buffer[dataIndex].data[i] = serializedData_0[i - 0];
          }

          
        }

      @compute @workgroup_size(1) fn fn(_arg_0: fn_Input) {
        log data 1 serializer(10);
        log data 2 serializer(20);
      }"
    `);
  });

  it('Parses console.logs with more arguments in a compute pipeline', ({ root }) => {
    const fn = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(d.u32(10), d.vec3u(2, 3, 4), d.u32(50));
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn serializeU32(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn serializeVec3u(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      @group(0) @binding(0) var<storage, read_write> dataIndexBuffer: atomic<u32>;

      struct log data schema {
        id: u32,
        data: array<u32, 64>,
      }

      @group(0) @binding(1) var<storage, read_write> log buffer: array<log data schema, 256>;

      fn log data 1 serializer(_arg_0: u32, _arg_1: vec3u, _arg_2: u32) {
          var dataIndex = atomicAdd(&dataIndexBuffer, 1);
          log buffer[dataIndex].id = 1;


          var serializedData_0 = serializeU32(_arg_0);
          for (var i = 0u; i< 1u; i++) {
            log buffer[dataIndex].data[i] = serializedData_0[i - 0];
          }


          var serializedData_1 = serializeVec3u(_arg_1);
          for (var i = 1u; i< 4u; i++) {
            log buffer[dataIndex].data[i] = serializedData_1[i - 1];
          }


          var serializedData_2 = serializeU32(_arg_2);
          for (var i = 4u; i< 5u; i++) {
            log buffer[dataIndex].data[i] = serializedData_2[i - 4];
          }

          
        }

      @compute @workgroup_size(1) fn fn(_arg_0: fn_Input) {
        log data 1 serializer(10, vec3u(2, 3, 4), 50);
      }"
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

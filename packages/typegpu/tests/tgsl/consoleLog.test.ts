import { beforeEach, describe, expect, vi } from 'vitest';
import { namespace } from '../../src/core/resolve/namespace.ts';
import tgpu, { d } from '../../src/index.js';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { deserializeAndStringify } from '../../src/tgsl/consoleLog/deserializers.ts';
import { CodegenState } from '../../src/types.ts';
import { it } from '../utils/extendedIt.ts';

describe('wgslGenerator with console.log', () => {
  let ctx: ResolutionCtxImpl;
  beforeEach(() => {
    ctx = new ResolutionCtxImpl({ namespace: namespace() });
    ctx.pushMode(new CodegenState());
  });

  it('Parses console.log in a stray function to a comment and warns', () => {
    using consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const fn = tgpu.fn([])(() => {
      console.log(987);
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        /* console.log() */;
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "'console.log' is only supported when resolving pipelines.",
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('Ignores console.logs in vertex shaders', () => {
    const myLog = (n: number) => {
      'use gpu';
      console.log(n);
    };

    const vs = tgpu.vertexFn({ out: { pos: d.builtin.position } })(
      () => {
        myLog(5);
        console.log(6);
        return { pos: d.vec4f() };
      },
    );
    expect(tgpu.resolve([vs])).toMatchInlineSnapshot(`
      "fn myLog(n: i32) {
        /* console.log() */;
      }

      struct vs_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vs() -> vs_Output {
        myLog(5i);
        /* console.log() */;
        return vs_Output(vec4f());
      }"
    `);
  });

  it('Ignores console.log in a fragment shader resolved without a pipeline', () => {
    const fs = tgpu
      .fragmentFn({ out: d.vec4f })(() => {
        console.log(d.u32(321));
        return d.vec4f();
      });

    expect(tgpu.resolve([fs])).toMatchInlineSnapshot(`
      "@fragment fn fs() -> @location(0) vec4f {
        /* console.log() */;
        return vec4f();
      }"
    `);
  });

  it('Parses a single console.log in a render pipeline', ({ root }) => {
    const vs = tgpu
      .vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
    const fs = tgpu
      .fragmentFn({ out: d.vec4f })(() => {
        console.log(d.u32(321));
        return d.vec4f();
      });

    const pipeline = root
      .withVertex(vs)
      .withFragment(fs, { format: 'rg8unorm' })
      .createPipeline();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct vs_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vs() -> vs_Output {
        return vs_Output(vec4f());
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        log1(321u);
        return vec4f();
      }"
    `);
  });

  it('Generates an overload for a function used on both stages', ({ root }) => {
    const myLog = (n: number) => {
      'use gpu';
      console.log(n);
    };

    const vs = tgpu.vertexFn({ out: { pos: d.builtin.position } })(
      () => {
        myLog(6);
        return { pos: d.vec4f() };
      },
    );
    const fs = tgpu.fragmentFn({ out: d.vec4f })(() => {
      myLog(7);
      return d.vec4f();
    });

    const pipeline = root.createRenderPipeline({
      vertex: vs,
      fragment: fs,
      targets: { format: 'rg8unorm' },
    });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "fn myLog(n: i32) {
        /* console.log() */;
      }

      struct vs_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vs() -> vs_Output {
        myLog(6i);
        return vs_Output(vec4f());
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log1serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log1(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn myLog_1(n: i32) {
        log1(n);
      }

      @fragment fn fs() -> @location(0) vec4f {
        myLog_1(7i);
        return vec4f();
      }"
    `);
  });

  it('Parses a single console.log in a compute pipeline', ({ root }) => {
    const fn = tgpu.computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(d.u32(10));
    });

    const pipeline = root.createComputePipeline({ compute: fn });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10u);
      }"
    `);
  });

  it('Parses two console.logs in a compute pipeline', ({ root }) => {
    const fn = tgpu.computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.log(d.u32(10));
      console.log(d.u32(20));
    });

    const pipeline = root.createComputePipeline({
      compute: fn,
    });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn log2serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log2_1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer(_arg_0);
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10u);
        log2_1(20u);
      }"
    `);
  });

  it('Parses console.logs with more arguments in a compute pipeline', ({ root }) => {
    const fn = tgpu.computeFn({
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

    const pipeline = root.createComputePipeline({
      compute: fn,
    });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn serializeVec3u(v: vec3u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
      }

      fn log1serializer(_arg_0: u32, _arg_1: vec3u, _arg_2: u32) {
        serializeU32(_arg_0);
        serializeVec3u(_arg_1);
        serializeU32(_arg_2);
      }

      fn log1(_arg_0: u32, _arg_1: vec3u, _arg_2: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1, _arg_2);
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        log1(10u, vec3u(2, 3, 4), 50u);
      }"
    `);
  });

  it('Parses console.logs with nested arrays/structs pipeline', ({ root }) => {
    const SimpleArray = d.arrayOf(d.u32, 4);
    const SimpleStruct = d.struct({ id: d.u32, data: SimpleArray });
    const ComplexArray = d.arrayOf(SimpleStruct, 3);
    const ComplexStruct = d.struct({ pos: d.vec3f, data: ComplexArray });

    const fn = tgpu.computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      const complexStruct = ComplexStruct({
        data: ComplexArray([
          SimpleStruct({ id: 0, data: SimpleArray([9, 8, 7, 6]) }),
          SimpleStruct({ id: 1, data: SimpleArray([8, 7, 6, 5]) }),
          SimpleStruct({ id: 2, data: SimpleArray([7, 6, 5, 4]) }),
        ]),
        pos: d.vec3f(1, 2, 3),
      });
      console.log(complexStruct);
    });

    const pipeline = root.createComputePipeline({ compute: fn });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct SimpleStruct {
        id: u32,
        data: array<u32, 4>,
      }

      struct ComplexStruct {
        pos: vec3f,
        data: array<SimpleStruct, 3>,
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeVec3f(v: vec3f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn arraySerializer_1(arg: array<u32,4>) {
        serializeU32(arg[0]);
        serializeU32(arg[1]);
        serializeU32(arg[2]);
        serializeU32(arg[3]);
      }

      fn compoundSerializer_1(_arg_0: u32, _arg_1: array<u32,4>) {
        serializeU32(_arg_0);
        arraySerializer_1(_arg_1);
      }

      fn SimpleStructSerializer(arg: SimpleStruct) {
        compoundSerializer_1(arg.id, arg.data);
      }

      fn arraySerializer(arg: array<SimpleStruct,3>) {
        SimpleStructSerializer(arg[0]);
        SimpleStructSerializer(arg[1]);
        SimpleStructSerializer(arg[2]);
      }

      fn compoundSerializer(_arg_0: vec3f, _arg_1: array<SimpleStruct,3>) {
        serializeVec3f(_arg_0);
        arraySerializer(_arg_1);
      }

      fn ComplexStructSerializer(arg: ComplexStruct) {
        compoundSerializer(arg.pos, arg.data);
      }

      fn log1serializer(_arg_0: ComplexStruct) {
        ComplexStructSerializer(_arg_0);
      }

      fn log1(_arg_0: ComplexStruct) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        var complexStruct = ComplexStruct(vec3f(1, 2, 3), array<SimpleStruct, 3>(SimpleStruct(0u, array<u32, 4>(9u, 8u, 7u, 6u)), SimpleStruct(1u, array<u32, 4>(8u, 7u, 6u, 5u)), SimpleStruct(2u, array<u32, 4>(7u, 6u, 5u, 4u))));
        log1(complexStruct);
      }"
    `);
  });

  it('Throws when not enough space to serialize console.log', ({ root }) => {
    const fn = tgpu.computeFn({
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

    const pipeline = root.createComputePipeline({ compute: fn });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - computePipeline:pipeline
      - computePipelineCore
      - computeFn:fn: Logged data needs to fit in 252 bytes (one of the logs requires 256 bytes). Consider increasing the limit by passing appropriate options to tgpu.init().]
    `);
  });

  it('Fallbacks and warns when using an unsupported feature', ({ root }) => {
    using consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const fn = tgpu.computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(() => {
      console.trace();
    });

    const pipeline = root.createComputePipeline({ compute: fn });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn fn_1(_arg_0: fn_Input) {
        /* console.log() */;
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Unsupported log method 'trace'.",
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('deserializeAndStringify', () => {
  it('works for string literals', () => {
    const data = new Uint32Array([]);
    const logInfo: (string | d.AnyWgslData)[] = ['String literal'];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "String literal",
      ]
    `,
    );
  });

  it('works for u32', () => {
    const data = new Uint32Array([123]);
    const logInfo: (string | d.AnyWgslData)[] = [d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "123",
      ]
    `,
    );
  });

  it('works for vec3u', () => {
    const data = new Uint32Array([1, 2, 3]);
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
      ]
    `,
    );
  });

  it('works for clumped vectors', () => {
    const data = new Uint32Array([1, 2, 3, 4, 5, 6]); // no alignment
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u, d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
        "vec3u(4, 5, 6)",
      ]
    `,
    );
  });

  it('works for multiple arguments', () => {
    const data = new Uint32Array([1, 2, 3, 456]);
    const logInfo: (string | d.AnyWgslData)[] = [
      'GID:',
      d.vec3u,
      'Result:',
      d.u32,
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "GID:",
        "vec3u(1, 2, 3)",
        "Result:",
        "456",
      ]
    `,
    );
  });

  it('works for arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.arrayOf(d.u32, 4)];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[1, 2, 3, 4]",
      ]
    `,
    );
  });

  it('works for nested arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [
      d.arrayOf(d.arrayOf(d.u32, 2), 2),
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[[1, 2], [3, 4]]",
      ]
    `,
    );
  });

  it('works for structs', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [
      d.struct({ vec: d.vec3u, num: d.u32 }),
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ vec: vec3u(1, 2, 3), num: 4 }",
      ]
    `,
    );
  });

  it('works for nested structs', () => {
    const data = new Uint32Array([1, 2, 3, 4, 1]);
    const logInfo: (string | d.AnyWgslData)[] = [
      d.struct({
        nested: d.struct({ vec: d.vec3u, num: d.u32 }),
        bool: d.bool,
      }),
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ nested: { vec: vec3u(1, 2, 3), num: 4 }, bool: true }",
      ]
    `,
    );
  });
});

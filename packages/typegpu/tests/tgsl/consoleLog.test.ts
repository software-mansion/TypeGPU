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
      console.log('stray function');
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
        console.log('Vertex shader');
        return { pos: d.vec4f() };
      });
    const fs = tgpu['~unstable']
      .fragmentFn({ out: d.vec4f })(() => {
        console.log('Fragment shader');
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
      console.log(10);
    });

    const pipeline = root['~unstable']
      .withCompute(fn)
      .createPipeline();

    expect(asWgsl(pipeline)).toMatchInlineSnapshot(`
      "struct fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> buffer: u32;

      fn log() {
          buffer = 1;
        }

      @compute @workgroup_size(1) fn fn(_arg_0: fn_Input) {
        log();
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

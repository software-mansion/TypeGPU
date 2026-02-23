import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('autogenerating wgsl headers for tgpu entry functions with raw string WGSL implementations', () => {
  it('works for fragment entry function with non-decorated non-struct output', () => {
    const mainFragment = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    }) /* wgsl */`{ return vec4f(in.uv[0]); }`;

    expect(tgpu.resolve([mainFragment])).toMatchInlineSnapshot(`
      "struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(in: mainFragment_Input) -> @location(0)  vec4f { return vec4f(in.uv[0]); }"
    `);
  });

  it('works for fragment entry function with decorated non-struct output', () => {
    const mainFragment = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.location(1, d.vec4f),
    }) /* wgsl */`{ return vec4f(in.uv[0]); }`;

    expect(tgpu.resolve([mainFragment])).toMatchInlineSnapshot(`
      "struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(in: mainFragment_Input) -> @location(1)  vec4f { return vec4f(in.uv[0]); }"
    `);
  });

  it('works for fragment entry function with struct output', () => {
    const mainFragment = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: {
        primary: d.location(1, d.vec4f),
      },
    }) /* wgsl */`{ return Out(vec4f(in.uv[0])); }`;

    expect(tgpu.resolve([mainFragment])).toMatchInlineSnapshot(`
      "struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      struct mainFragment_Output {
        @location(1) primary: vec4f,
      }

      @fragment fn mainFragment(in: mainFragment_Input) -> mainFragment_Output { return mainFragment_Output(vec4f(in.uv[0])); }"
    `);
  });

  it('works for compute entry function', () => {
    const mainCompute = tgpu.computeFn({
      in: { index: d.builtin.globalInvocationId },
      workgroupSize: [1],
    }) /* wgsl */`{ let x = in.index; }`;

    expect(tgpu.resolve([mainCompute])).toMatchInlineSnapshot(`
      "struct mainCompute_Input {
        @builtin(global_invocation_id) index: vec3u,
      }

      @compute @workgroup_size(1) fn mainCompute(in: mainCompute_Input)  { let x = in.index; }"
    `);
  });

  it('works for vertex entry function', () => {
    const mainVertex = tgpu.vertexFn({
      in: { vertexIndex: d.builtin.vertexIndex },
      out: { outPos: d.builtin.position, uv: d.vec2f },
    })(/* wgsl */ `{
    var pos = array<vec2f, 3>(
      vec2(0.0, 0.5),
      vec2(-0.5, -0.5),
      vec2(0.5, -0.5)
    );

    var uv = array<vec2f, 3>(
      vec2(0.5, 1.0),
      vec2(0.0, 0.0),
      vec2(1.0, 0.0),
    );

    return Out(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
  }`);

    expect(tgpu.resolve([mainVertex])).toMatchInlineSnapshot(`
      "struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn mainVertex(in: mainVertex_Input) -> mainVertex_Output {
          var pos = array<vec2f, 3>(
            vec2(0.0, 0.5),
            vec2(-0.5, -0.5),
            vec2(0.5, -0.5)
          );

          var uv = array<vec2f, 3>(
            vec2(0.5, 1.0),
            vec2(0.0, 0.0),
            vec2(1.0, 0.0),
          );

          return mainVertex_Output(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
        }"
    `);
  });
});

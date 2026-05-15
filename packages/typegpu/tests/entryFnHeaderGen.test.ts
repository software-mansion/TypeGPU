import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

describe('autogenerating wgsl headers for tgpu entry functions with raw string WGSL implementations', () => {
  it('works for fragment entry function with non-decorated non-struct output', () => {
    const mainFragment = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(in.uv[0]); }`;

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
    }) /* wgsl */ `{ return vec4f(in.uv[0]); }`;

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
    }) /* wgsl */ `{ return Out(vec4f(in.uv[0])); }`;

    expect(tgpu.resolve([mainFragment])).toMatchInlineSnapshot(`
      "struct mainFragment_Output {
        @location(1) primary: vec4f,
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(in: mainFragment_Input) -> mainFragment_Output { return mainFragment_Output(vec4f(in.uv[0])); }"
    `);
  });

  it('works for fragment entry function with mixed positional builtins and struct varyings', () => {
    const mainFragment = tgpu.fragmentFn({
      in: { uv: d.vec2f, pos: d.builtin.position },
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(in.uv[0] + in.pos.x); }`;

    expect(tgpu.resolve([mainFragment])).toMatchInlineSnapshot(`
      "struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(in: mainFragment_Input, @builtin(position) pos: vec4f) -> @location(0)  vec4f { return vec4f(in.uv[0] + pos.x); }"
    `);
  });

  it('works for compute entry function', () => {
    const mainCompute = tgpu.computeFn({
      in: { index: d.builtin.globalInvocationId },
      workgroupSize: [1],
    }) /* wgsl */ `{ let x = in.index; }`;

    expect(tgpu.resolve([mainCompute])).toMatchInlineSnapshot(
      `"@compute @workgroup_size(1) fn mainCompute(@builtin(global_invocation_id) index: vec3u) { let x = index; }"`,
    );
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
      "struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn mainVertex(@builtin(vertex_index) vertexIndex: u32) -> mainVertex_Output {
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

          return mainVertex_Output(vec4f(pos[vertexIndex], 0.0, 1.0), uv[vertexIndex]);
        }"
    `);
  });

  it('renames arguments to not shadow local declarations', () => {
    const mainVertex = tgpu.vertexFn({
      in: { vi: d.builtin.vertexIndex, ii: d.builtin.instanceIndex },
      out: { outPos: d.builtin.position },
    })(/* wgsl */ `{
  var vi = in.vi;
  let ii = in.ii;

  return Out(vec4f(vi, ii, 0, 1));
}`);

    const resolved = tgpu.resolve([mainVertex]);
    expect(resolved).not.toContain('vi = vi;');
    expect(resolved).not.toContain('ii = ii;');
    expect(resolved).toMatchInlineSnapshot(`
      "struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
      }

      @vertex fn mainVertex(@builtin(vertex_index) vi_1: u32, @builtin(instance_index) ii_1: u32) -> mainVertex_Output {
        var vi = vi_1;
        let ii = ii_1;

        return mainVertex_Output(vec4f(vi, ii, 0, 1));
      }"
    `);
  });

  it('does not rename arguments causing new clashes with other variables', () => {
    const mainVertex = tgpu.vertexFn({
      in: { vi: d.builtin.vertexIndex },
      out: { outPos: d.builtin.position },
    })(/* wgsl */ `{
  var vi_1 = 0;
  var vi = in.vi;

  return Out(vec4f(vi, vi_1, 0, 1));
}`);

    const resolved = tgpu.resolve([mainVertex]);
    expect(resolved).not.toContain('vi = vi;');
    expect(resolved).not.toContain('vi = vi_1;');
    expect(resolved).toMatchInlineSnapshot(`
      "struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
      }

      @vertex fn mainVertex(@builtin(vertex_index) vi_2: u32) -> mainVertex_Output {
        var vi_1 = 0;
        var vi = vi_2;

        return mainVertex_Output(vec4f(vi, vi_1, 0, 1));
      }"
    `);
  });

  it('does not cause clashes with other parameters', () => {
    const mainVertex = tgpu.vertexFn({
      in: { vi: d.builtin.vertexIndex, vi_1: d.builtin.instanceIndex },
      out: { outPos: d.builtin.position },
    })(/* wgsl */ `{
  var vi = 0;
  var a = in.vi;
  var b = in.vi_1;

  return Out(vec4f(a, b, 0, 1));
}`);

    const resolved = tgpu.resolve([mainVertex]);
    expect(resolved).toMatchInlineSnapshot(`
      "struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
      }

      @vertex fn mainVertex(@builtin(vertex_index) vi_1: u32, @builtin(instance_index) vi_1_1: u32) -> mainVertex_Output {
        var vi = 0;
        var a = vi_1;
        var b = vi_1_1;

        return mainVertex_Output(vec4f(a, b, 0, 1));
      }"
    `);
  });
});

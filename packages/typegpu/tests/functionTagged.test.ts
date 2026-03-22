import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

describe('tagged syntax', () => {
  describe('function', () => {
    it('parses template literal without arguments', () => {
      const getConst = tgpu.fn([], d.i32)`() { return 3; }`;

      expect(tgpu.resolve([getConst])).toMatchInlineSnapshot(`"fn getConst() -> i32{ return 3; }"`);
    });

    it('parses template literal with arguments of different types', () => {
      const add = tgpu.fn([], d.f32)`() {
        return f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`;

      expect(tgpu.resolve([add])).toMatchInlineSnapshot(`
        "fn add() -> f32{
                return f32(10) + f32(20) + f32(30.1);
              }"
      `);
    });

    it('parses template literal with arguments of different types, object args', () => {
      const add = tgpu.fn([], d.f32)`() {
        return f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`;

      expect(tgpu.resolve([add])).toMatchInlineSnapshot(`
        "fn add() -> f32{
                return f32(10) + f32(20) + f32(30.1);
              }"
      `);
    });
  });

  describe('vertex', () => {
    it('parses template literal without arguments', () => {
      const vertexFn = tgpu.vertexFn({
        in: { idx: d.builtin.instanceIndex },
        out: { pos: d.builtin.position },
      })`{ return Out(vec4f(f32(in.idx), 0.0, 0.0, 1.0)); }`.$name('vertexFn');

      expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
        "struct vertexFn_Output {
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexFn(@builtin(instance_index) idx: u32) -> vertexFn_Output { return vertexFn_Output(vec4f(f32(idx), 0.0, 0.0, 1.0)); }"
      `);
    });

    it('parses template literal with arguments of different types', () => {
      const vertexFn = tgpu.vertexFn({
        in: { idx: d.builtin.instanceIndex },
        out: { pos: d.builtin.position },
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
        return Out(vec4f(a + f32(in.idx), 0.0, 0.0, 1.0));
      }`.$name('vertexFn');

      expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
        "struct vertexFn_Output {
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexFn(@builtin(instance_index) idx: u32) -> vertexFn_Output {
                var a = f32(10) + f32(20) + f32(30.1);
                return vertexFn_Output(vec4f(a + f32(idx), 0.0, 0.0, 1.0));
              }"
      `);
    });
  });

  describe('fragment', () => {
    it('parses template literal without arguments', () => {
      const fragmentFn = tgpu.fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })`{ return vec4f(); }`;

      expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(
        `"@fragment fn fragmentFn(@builtin(position) pos: vec4f) -> @location(0)  vec4f { return vec4f(); }"`,
      );
    });

    it('parses template literal with arguments of different types', () => {
      const fragmentFn = tgpu.fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
        return vec4f();
      }`;

      expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
        "@fragment fn fragmentFn(@builtin(position) pos: vec4f) -> @location(0)  vec4f {
                var a = f32(10) + f32(20) + f32(30.1);
                return vec4f();
              }"
      `);
    });
  });

  describe('compute', () => {
    it('parses template literal without arguments', () => {
      const computeFn = tgpu.computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })`{}`;

      expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(
        `"@compute @workgroup_size(1) fn computeFn(@builtin(global_invocation_id) gid: vec3u)  {}"`,
      );
    });

    it('parses template literal with arguments of different types', () => {
      const computeFn = tgpu.computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`;

      expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
        "@compute @workgroup_size(1) fn computeFn(@builtin(global_invocation_id) gid: vec3u)  {
                var a = f32(10) + f32(20) + f32(30.1);
              }"
      `);
    });
  });
});

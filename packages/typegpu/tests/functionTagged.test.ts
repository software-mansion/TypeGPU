import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('tagged syntax', () => {
  describe('function', () => {
    it('parses template literal without arguments', () => {
      const getConst = tgpu.fn([], d.i32)`() { return 3; }`;

      expect(tgpu.resolve([getConst])).toMatchInlineSnapshot(
        `"fn getConst() -> i32{ return 3; }"`,
      );
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
      })`{ return in.pos; }`.$name('vertexFn');

      expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
        "struct vertexFn_Input {
          @builtin(instance_index) idx: u32,
        }

        struct vertexFn_Output {
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexFn(in: vertexFn_Input) -> vertexFn_Output { return in.pos; }"
      `);
    });

    it('parses template literal with arguments of different types', () => {
      const vertexFn = tgpu.vertexFn({
        in: { idx: d.builtin.instanceIndex },
        out: { pos: d.builtin.position },
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
        return in.pos;
      }`.$name('vertexFn');

      expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
        "struct vertexFn_Input {
          @builtin(instance_index) idx: u32,
        }

        struct vertexFn_Output {
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexFn(in: vertexFn_Input) -> vertexFn_Output {
                var a = f32(10) + f32(20) + f32(30.1);
                return in.pos;
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

      expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
        "struct fragmentFn_Input {
          @builtin(position) pos: vec4f,
        }

        @fragment fn fragmentFn(in: fragmentFn_Input) -> @location(0)  vec4f { return vec4f(); }"
      `);
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
        "struct fragmentFn_Input {
          @builtin(position) pos: vec4f,
        }

        @fragment fn fragmentFn(in: fragmentFn_Input) -> @location(0)  vec4f {
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

      expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
        "struct computeFn_Input {
          @builtin(global_invocation_id) gid: vec3u,
        }

        @compute @workgroup_size(1) fn computeFn(in: computeFn_Input)  {}"
      `);
    });

    it('parses template literal with arguments of different types', () => {
      const computeFn = tgpu.computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`;

      expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
        "struct computeFn_Input {
          @builtin(global_invocation_id) gid: vec3u,
        }

        @compute @workgroup_size(1) fn computeFn(in: computeFn_Input)  {
                var a = f32(10) + f32(20) + f32(30.1);
              }"
      `);
    });
  });
});

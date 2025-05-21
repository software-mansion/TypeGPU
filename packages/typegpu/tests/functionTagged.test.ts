import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('tagged syntax', () => {
  describe('function', () => {
    it('parses template literal without arguments', () => {
      const constFn = tgpu['~unstable'].fn([], d.i32)`() -> i32 {
        return 3;
      }`.$name('const');

      const actual = parseResolved({ constFn });

      const expected = parse('fn const() -> i32 { return 3; }');

      expect(actual).toBe(expected);
    });

    it('parses template literal with arguments of different types', () => {
      const addFn = tgpu['~unstable'].fn([], d.f32)`() -> f32 {
        return f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`.$name('add');

      const actual = parseResolved({ addFn });

      const expected = parse(
        'fn add() -> f32 { return f32(10) + f32(20) + f32(30.1); }',
      );

      expect(actual).toBe(expected);
    });

    it('parses template literal with arguments of different types, object args', () => {
      const addFn = tgpu['~unstable'].fn([], d.f32)`() -> f32 {
        return f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`.$name('add');

      const actual = parseResolved({ addFn });

      const expected = parse(
        'fn add() -> f32 { return f32(10) + f32(20) + f32(30.1); }',
      );

      expect(actual).toBe(expected);
    });
  });

  describe('vertex', () => {
    it('parses template literal without arguments', () => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        in: { pos: d.builtin.position },
        out: { pos: d.builtin.position },
      })`{ return in.pos; }`.$name('vertexFn');

      const actual = parseResolved({ vertexFn });

      const expected = parse(`
        struct vertexFn_Input { @builtin(position) pos: vec4f, }
        struct vertexFn_Output { @builtin(position) pos: vec4f, } 
        @vertex fn vertexFn(in: vertexFn_Input) -> vertexFn_Output { return in.pos; }
        `);

      expect(actual).toBe(expected);
    });

    it('parses template literal with arguments of different types', () => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        in: { pos: d.builtin.position },
        out: { pos: d.builtin.position },
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
        return in.pos;
      }`.$name('vertexFn');

      const actual = parseResolved({ vertexFn });

      const expected = parse(`
        struct vertexFn_Input { @builtin(position) pos: vec4f, }
        struct vertexFn_Output { @builtin(position) pos: vec4f, } 
        @vertex fn vertexFn(in: vertexFn_Input) -> vertexFn_Output { 
          var a = f32(10) + f32(20) + f32(30.1);
          return in.pos;
        }`);

      expect(actual).toBe(expected);
    });
  });

  describe('fragment', () => {
    it('parses template literal without arguments', () => {
      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })`{ return vec4f(); }`.$name('fragmentFn');

      const actual = parseResolved({ fragmentFn });

      const expected = parse(`
        struct fragmentFn_Input {
          @builtin(position) pos: vec4f,
        }
        @fragment fn fragmentFn(in: fragmentFn_Input) -> @location(0) vec4f { 
          return vec4f(); 
        }`);

      expect(actual).toBe(expected);
    });

    it('parses template literal with arguments of different types', () => {
      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
        return vec4f();
      }`.$name('fragmentFn');

      const actual = parseResolved({ fragmentFn });

      const expected = parse(`
        struct fragmentFn_Input {
          @builtin(position) pos: vec4f,
        }
        @fragment fn fragmentFn(in: fragmentFn_Input) -> @location(0) vec4f { 
          var a = f32(10) + f32(20) + f32(30.1);
          return vec4f(); 
        }`);

      expect(actual).toBe(expected);
    });
  });

  describe('compute', () => {
    it('parses template literal without arguments', () => {
      const computeFn = tgpu['~unstable'].computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })`{}`.$name('computeFn');

      const actual = parseResolved({ computeFn });

      const expected = parse(`
        struct computeFn_Input {
          @builtin(global_invocation_id) gid: vec3u,
        }
        @compute @workgroup_size(1) fn computeFn(in: computeFn_Input) { }
        `);

      expect(actual).toBe(expected);
    });

    it('parses template literal with arguments of different types', () => {
      const computeFn = tgpu['~unstable'].computeFn({
        in: { gid: d.builtin.globalInvocationId },
        workgroupSize: [1],
      })`{
        var a = f32(${10}) + f32(${'20'}) + f32(${30.1});
      }`.$name('computeFn');

      const actual = parseResolved({ computeFn });

      const expected = parse(`
        struct computeFn_Input {
          @builtin(global_invocation_id) gid: vec3u,
        }
        @compute @workgroup_size(1) fn computeFn(in: computeFn_Input) { var a = f32(10) + f32(20) + f32(30.1); }
        `);

      expect(actual).toBe(expected);
    });
  });
});

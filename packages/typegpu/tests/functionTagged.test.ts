import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { parse, parseResolved } from './utils/parseResolved';

describe('tgpu.fn tagged syntax', () => {
  describe('function', () => {
    it('parses template literal without arguments', () => {
      const constFn = tgpu['~unstable'].fn([], d.i32)`() {
        return 3;
      }`.$name('const');

      const actual = parseResolved({ constFn });

      const expected = parse('fn const() { return 3; }');

      expect(actual).toEqual(expected);
    });

    it('parses template literal with arguments of different types', () => {
      const addFn = tgpu['~unstable'].fn([], d.i32)`() {
        return ${10} + ${'20'} + ${30.1};
      }`.$name('add');

      const actual = parseResolved({ addFn });

      const expected = parse('fn add() { return 10 + 20 + 30.1; }');

      expect(actual).toEqual(expected);
    });

    it('parses template literal with arguments of different types, new syntax', () => {
      const addFn = tgpu['~unstable'].fn({})`{
        return ${10} + ${'20'} + ${30.1};
      }`.$name('add');

      const actual = parseResolved({ addFn });

      const expected = parse('fn add() { return 10 + 20 + 30.1; }');

      expect(actual).toEqual(expected);
    });
  });

  describe('vertex', () => {
    it('parses template literal with arguments of different types for vertex', () => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        in: {},
        out: {},
      })`{
      ${10} + ${'20'} + ${30.1};
    }`.$name('vertexFn');

      const actual = parseResolved({ vertexFn });

      const expected = parse(`
        struct vertexFn_Input {}
        struct vertexFn_Output {} 
        @vertex fn vertexFn(in: vertexFn_Input) -> vertexFn_Output { 10 + 20 + 30.1; }
        `);

      expect(actual).toEqual(expected);
    });
  });
});

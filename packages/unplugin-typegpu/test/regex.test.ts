import Babel from '@babel/standalone';
import babelPlugin from '../src/babel.ts';
import { defaultOptions } from '../src/core/common.ts';
import { describe, expect, it } from 'vitest';

const regex = defaultOptions.include;

describe('default regex', () => {
  it('should match .ts files', () => {
    expect(regex.test('file.ts')).toBe(true);
    expect(regex.test('file.mts')).toBe(true);
    expect(regex.test('file.tsx')).toBe(true);
    expect(regex.test('file.mtsx')).toBe(true);
    expect(regex.test('file.cts')).toBe(true);
    expect(regex.test('file.ctsx')).toBe(true);
  });

  it('should match .js files', () => {
    expect(regex.test('file.js')).toBe(true);
    expect(regex.test('file.mjs')).toBe(true);
    expect(regex.test('file.jsx')).toBe(true);
    expect(regex.test('file.mjsx')).toBe(true);
    expect(regex.test('file.cjs')).toBe(true);
    expect(regex.test('file.cjsx')).toBe(true);
  });

  it('should match query parameters', () => {
    expect(regex.test('file.ts?query=1')).toBe(true);
    expect(regex.test('file.js?query=1')).toBe(true);
    expect(regex.test('file.cts?query=1')).toBe(true);
    expect(regex.test('file.cjs?query=1')).toBe(true);
  });

  it('should not match other file types', () => {
    expect(regex.test('file.css')).toBe(false);
    expect(regex.test('file.html')).toBe(false);
    expect(regex.test('file.json')).toBe(false);
  });

  it('should handle complex query strings', () => {
    expect(regex.test('component.tsx?inline&raw')).toBe(true);
    expect(regex.test('utils.mjs?t=1234567890')).toBe(true);
    expect(regex.test('app.ts?import=default&as=App')).toBe(true);
  });

  it('should match files with multiple dots in name', () => {
    expect(regex.test('my.component.tsx')).toBe(true);
    expect(regex.test('utils.test.ts')).toBe(true);
    expect(regex.test('config.dev.mjs')).toBe(true);
  });

  it('should not match partial extensions', () => {
    expect(regex.test('file.t')).toBe(false);
    expect(regex.test('file.j')).toBe(false);
    expect(regex.test('file.tsv')).toBe(false);
    expect(regex.test('file.jso')).toBe(false);
    expect(regex.test('file.xts')).toBe(false);
    expect(regex.test('file.cmjs')).toBe(false);
  });

  it('should not match files without extensions', () => {
    expect(regex.test('README')).toBe(false);
    expect(regex.test('Dockerfile')).toBe(false);
    expect(regex.test('makefile')).toBe(false);
  });

  it('should not match if extension is not at end (before query)', () => {
    expect(regex.test('file.ts.map')).toBe(false);
    expect(regex.test('component.tsx.old')).toBe(false);
    expect(regex.test('script.js.bak?query=1')).toBe(false);
  });

  it('should handle empty and special query parameters', () => {
    expect(regex.test('file.ts?')).toBe(true);
    expect(regex.test('file.jsx?=')).toBe(true);
    expect(regex.test('file.mts?&&&')).toBe(true);
    expect(regex.test('file.js?#hash')).toBe(true);
  });
});

describe('[BABEL] default include', () => {
  const transform = (filename: string) =>
    Babel.transform(`const f = () => { 'use gpu'; return 1; };`, {
      filename,
      plugins: [babelPlugin],
      parserOpts: { plugins: ['typescript'] },
    }).code;

  it.each(['shader.ts', 'shader.mts', 'shader.cts', 'shader.js', 'shader.mjs', 'shader.cjs'])(
    'transforms %s',
    (filename) => {
      expect(transform(filename)).toContain('__TYPEGPU_META__');
    },
  );

  it('skips files that do not match', () => {
    expect(transform('shader.json')).not.toContain('__TYPEGPU_META__');
  });
});

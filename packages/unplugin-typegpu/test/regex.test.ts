import { defaultOptions } from '../src/common.ts';
import { describe, expect, it } from 'vitest';

const regex = defaultOptions.include;

describe('default regex', () => {
  it('should match .ts files', () => {
    expect(regex.test('file.ts')).toBe(true);
    expect(regex.test('file.mts')).toBe(true);
    expect(regex.test('file.tsx')).toBe(true);
    expect(regex.test('file.mtsx')).toBe(true);
  });

  it('should match .js files', () => {
    expect(regex.test('file.js')).toBe(true);
    expect(regex.test('file.mjs')).toBe(true);
    expect(regex.test('file.jsx')).toBe(true);
    expect(regex.test('file.mjsx')).toBe(true);
  });

  it('should match query parameters', () => {
    expect(regex.test('file.ts?query=1')).toBe(true);
    expect(regex.test('file.js?query=1')).toBe(true);
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

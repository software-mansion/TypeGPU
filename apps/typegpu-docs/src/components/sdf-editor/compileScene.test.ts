import { expect, it } from 'vitest';
import { compileScene } from './compileScene.ts';
import { defaultScene } from './defaultScene.ts';

it('compiles the editable scene with ray marching, shadow and uniform bindings', () => {
  const code = compileScene(defaultScene);
  expect(code).toContain('@fragment');
  expect(code).toContain('sdfFragment');
  expect(code).toContain('@group(0) @binding(0)');
  expect(code).toContain('shadow');
  expect(code).toContain('scene');
});
it('rejects missing scene exports and invalid scene implementations', () => {
  expect(() => compileScene('export const other = 1;')).toThrow(
    'Export a GPU function named scene',
  );
  expect(() => compileScene("export const scene = () => { 'use gpu'; return 3; }; ")).toThrow();
});
it('updates generated shaders when the scene source changes', () => {
  expect(compileScene(defaultScene.replace('0.95, 0.35, 0.12', '0.1, 0.8, 0.2'))).not.toBe(
    compileScene(defaultScene),
  );
});

import { describe, expect, it } from 'vitest';
import { compile, evaluateSource } from './compile.ts';
import { samples } from './samples.ts';
import { tgpu } from 'typegpu';
import { WgslGenerator } from 'typegpu/~internal';
import { glOptions } from '@typegpu/gl';

describe('shader explorer', () => {
  for (const target of ['wgsl', 'glsl'] as const) {
    for (const [name, source] of Object.entries(samples)) {
      it(`traces ${name} in ${target}`, () => {
        const result = compile(source, target);
        const plain =
          target === 'wgsl' ? new WgslGenerator() : glOptions().unstable_shaderGenerator;
        expect(result.code).toBe(
          tgpu.resolve(Object.values(evaluateSource(source)), { unstable_shaderGenerator: plain }),
        );
        expect(result.code.length).toBeGreaterThan(0);
        expect(result.nodes.some((node) => node.kind === 'expression')).toBe(true);
        expect(result.nodes.map((node) => node.step).toSorted((a, b) => a - b)).toEqual(
          result.nodes.map((_, index) => index + 1),
        );
        for (const node of result.nodes) {
          if (node.parent !== null) {
            expect(result.nodes[node.parent].step).toBeGreaterThan(node.step);
          }
        }
      });
    }
  }
  it('keeps nested function invocations and repeated identifiers distinct', () => {
    const result = compile(samples['Function calls'], 'wgsl');
    expect(result.nodes.filter((node) => node.kind === 'function').length).toBeGreaterThan(1);
    const repeated = result.nodes.filter(
      (node) => node.kind === 'expression' && node.label === 'p',
    );
    expect(repeated.length).toBeGreaterThan(1);
    expect(new Set(repeated.map((node) => node.id)).size).toBe(repeated.length);
  });
  it('resolves default exports and export aliases', () => {
    const result = compile(
      `import { d } from 'typegpu'; const A = d.struct({ x: d.f32 }); export { A as B }; export default d.struct({ y: d.u32 });`,
      'wgsl',
    );
    expect(result.exports).toEqual(['B', 'default']);
    expect(result.code).toContain('struct');
  });
  it('resolves imported companion functions', () => {
    const result = compile(
      `import { tgpu, d } from 'typegpu';
      import { sdDisk } from '@typegpu/sdf';
      export const disk = tgpu.fn([d.vec2f], d.f32)((p) => { 'use gpu'; return sdDisk(p, 1); });`,
      'wgsl',
    );
    expect(result.code).toContain('length');
    expect(result.nodes.filter((node) => node.kind === 'function').length).toBeGreaterThan(1);
  });

  it('reports invalid source, missing exports, and unsupported imports', () => {
    expect(() => compile('export const =', 'wgsl')).toThrow();
    expect(() => compile('const x = 1;', 'wgsl')).toThrow('Export a TypeGPU');
    expect(() => compile(`import x from 'missing'; export default x;`, 'wgsl')).toThrow(
      'Unsupported import',
    );
  });
});

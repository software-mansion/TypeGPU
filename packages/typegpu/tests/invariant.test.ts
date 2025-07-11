import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('invariant', () => {
  it('adds @invariant attribute to position builtin', () => {
    const s1 = d.struct({
      position: d.invariant(d.builtin.position),
    });

    const resolved = tgpu.resolve({
      externals: { s1 },
      names: 'strict',
    });

    expect(resolved).toContain(
      '@invariant @builtin(position) position: vec4f',
    );
  });

  it('throws error when applied to non-position builtin', () => {
    expect(() => {
      d.invariant(d.builtin.vertexIndex);
    }).toThrow(
      'The @invariant attribute must only be applied to the position built-in value.',
    );
  });

  it('throws error when applied to non-builtin data', () => {
    expect(() => {
      d.invariant(d.f32);
    }).toThrow(
      'The @invariant attribute must only be applied to the position built-in value.',
    );
  });

  it('can be used in vertex shader output', () => {
    const VertexOutput = d.struct({
      pos: d.invariant(d.builtin.position),
      color: d.vec4f,
    });

    const resolved = tgpu.resolve({
      externals: { VertexOutput },
      names: 'strict',
    });

    expect(resolved).toContain('@invariant @builtin(position) pos: vec4f');
    expect(resolved).toContain('color: vec4f');
  });
});

import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.js';

describe('invariant', () => {
  it('adds @invariant attribute to position builtin', () => {
    const s1 = d.struct({
      position: d.invariant(d.builtin.position),
    });

    expect(tgpu.resolve([s1])).toContain('@invariant @builtin(position) position: vec4f');
  });

  it('throws error when applied to non-position builtin', () => {
    expect(() => {
      // @ts-expect-error - Testing error case with invalid builtin
      d.invariant(d.builtin.vertexIndex);
    }).toThrow('The @invariant attribute must only be applied to the position built-in value.');
  });

  it('throws error when applied to non-builtin data', () => {
    expect(() => {
      // @ts-expect-error - Testing error case with non-builtin data
      d.invariant(d.f32);
    }).toThrow('The @invariant attribute must only be applied to the position built-in value.');
  });

  it('can be used in vertex shader output', () => {
    const VertexOutput = d.struct({
      pos: d.invariant(d.builtin.position),
      color: d.vec4f,
    });

    const resolved = tgpu.resolve([VertexOutput]);

    expect(resolved).toContain('@invariant @builtin(position) pos: vec4f');
    expect(resolved).toContain('color: vec4f');
  });
});

import { describe, expect, it } from 'vitest';
import { generate } from '../gen.mjs';

describe('aliases generator', () => {
  it('generates alias definitions from wgsl', () => {
    const wgsl = `
struct TriangleData {
  pos: vec3f,
}

alias Triangle = TriangleData;
alias u = u32;
alias ArrayDoubleU32 = array<u32, 2>;
`;
    const generated = generate(wgsl);

    expect(generated).toContain('const Triangle = TriangleData;');
    expect(generated).toContain('const u = d.u32;');
    expect(generated).toContain('const ArrayDoubleU32 = d.arrayOf(d.u32, 2);');
  });

  it('replaces types with predeclared aliases', () => {
    expect(generate('alias v3u = vec3<u32>;')).toContain('const v3u = d.vec3u');
  });
});

import { UniformGroup } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { uniforms } from '@typegpu/pixi';

describe('uniforms', () => {
  const lightUniforms = uniforms({
    intensity: d.f32,
    count: d.u32,
    color: d.vec3f,
    cell: d.vec2i,
    rotation: d.mat2x2f,
  });

  it('names the types the way PixiJS does', () => {
    expect(lightUniforms.pixiTypes).toStrictEqual({
      intensity: 'f32',
      count: 'u32',
      color: 'vec3<f32>',
      cell: 'vec2<i32>',
      rotation: 'mat2x2<f32>',
    });
  });

  it('creates a uniform group that starts at zero', () => {
    const group = lightUniforms.createGroup();

    expect(group).toBeInstanceOf(UniformGroup);
    expect(group.uniforms).toStrictEqual({
      intensity: 0,
      count: 0,
      color: new Float32Array(3),
      cell: new Int32Array(2),
      rotation: new Float32Array(4),
    });
  });

  it('creates a uniform group with initial values', () => {
    const group = lightUniforms.createGroup({
      intensity: 2,
      color: d.vec3f(1, 0.5, 0.25),
      cell: [3, -4],
      rotation: d.mat2x2f(1, 2, 3, 4),
    });

    expect(group.uniforms).toStrictEqual({
      intensity: 2,
      count: 0,
      color: new Float32Array([1, 0.5, 0.25]),
      cell: new Int32Array([3, -4]),
      rotation: new Float32Array([1, 2, 3, 4]),
    });
  });

  it('writes to a group it created', () => {
    const group = lightUniforms.createGroup();

    lightUniforms.write(group, { intensity: 3, color: [0, 1, 0] });

    expect(group.uniforms.intensity).toBe(3);
    expect(group.uniforms.color).toStrictEqual(new Float32Array([0, 1, 0]));
  });

  it("writes to a PixiJS 3D material's data", () => {
    const material = { data: {} as Record<string, unknown> };

    lightUniforms.write(material, { intensity: 3, color: d.vec3f(0, 1, 0), cell: [1, 2] });

    // Materials take plain arrays, and upload when a field is assigned
    expect(material.data).toStrictEqual({ intensity: 3, color: [0, 1, 0], cell: [1, 2] });
  });

  it('drops the padding of a mat3x3f', () => {
    const matrixUniforms = uniforms({ transform: d.mat3x3f });
    const group = matrixUniforms.createGroup({
      transform: d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9),
    });

    expect(group.uniforms.transform).toStrictEqual(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('rejects values of the wrong size', () => {
    expect(() => lightUniforms.createGroup({ color: [1, 2] })).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] Uniform 'color' is a vec3f, which takes 3 numbers, but got 2.]`,
    );
  });

  it('rejects unknown names', () => {
    const group = lightUniforms.createGroup();
    expect(() =>
      // @ts-expect-error
      lightUniforms.write(group, { colour: [1, 2, 3] }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] There's no uniform named 'colour'. Declared: intensity, count, color, cell, rotation.]`,
    );
  });

  it("rejects targets that don't hold these uniforms", () => {
    expect(() => lightUniforms.write({}, { intensity: 1 })).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] Can't write uniforms to this object. Pass a PixiJS 3D material, or a filter, post effect or uniform group that was created with these uniforms.]`,
    );
  });

  it('rejects types PixiJS cannot upload', () => {
    expect(() =>
      // @ts-expect-error
      uniforms({ flag: d.bool }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] 'bool' can't be a uniform. Use f32, i32, u32, a vector of those, or a mat2x2f, mat3x3f or mat4x4f.]`,
    );
  });
});

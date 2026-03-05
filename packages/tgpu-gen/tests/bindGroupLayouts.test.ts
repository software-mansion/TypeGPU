import { describe, expect, it } from 'vitest';
import { generate } from '../gen.mjs';

describe('bindGroupLayouts generator', () => {
  it('generates uniform tgpu.bindGroupLayout definitions', () => {
    const wgsl = `
struct TriangleData {
    position : vec4f,
    velocity : vec2f,
};

@binding(0) @group(0) var<uniform> trianglePos: array<TriangleData, 1000>;
@binding(1) @group(0) var<uniform> colorPalette: vec3<f32>;
@binding(2) @group(0) var<uniform> threshold: u32;
`;

    const expected = `\
export const layout0 = tgpu.bindGroupLayout({
  trianglePos: {
    uniform: d.arrayOf(TriangleData, 1000),
  },
  colorPalette: {
    uniform: d.vec3f,
  },
  threshold: {
    uniform: d.u32,
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates storage tgpu.bindGroupLayout definitions', () => {
    const wgsl = `
struct TriangleData {
    position : vec4f,
    velocity : vec2f,
};

@binding(0) @group(0) var<storage> trianglePos: array<TriangleData, 1000>;
@binding(1) @group(0) var<storage, read> colorPalette: vec3<f32>;
@binding(2) @group(0) var<storage, read_write> threshold: u32;
`;

    const expected = `\
export const layout0 = tgpu.bindGroupLayout({
  trianglePos: {
    storage: d.arrayOf(TriangleData, 1000),
  },
  colorPalette: {
    storage: d.vec3f,
    access: 'readonly',
  },
  threshold: {
    storage: d.u32,
    access: 'mutable',
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates texture tgpu.bindGroupLayout definitions', () => {
    const wgsl = `
@group(1) @binding(0) var tex0: texture_3d<f32>;
@group(1) @binding(1) var tex1: texture_external;
@group(1) @binding(2) var tex2: texture_2d<f32>;
@group(1) @binding(3) var tex3: texture_depth_multisampled_2d;
@group(1) @binding(4) var tex4: texture_multisampled_2d<u32>;
@group(1) @binding(4) var tex4: texture_multisampled_2d<u32>;
@group(1) @binding(5) var tex5: texture_depth_cube_array;
@group(1) @binding(6) var tex6: texture_depth_2d_array;
`;

    const expected = `\
export const layout1 = tgpu.bindGroupLayout({
  tex0: {
    texture: 'float',
    viewDimension: '3d',
  },
  tex1: {
    externalTexture: {},
  },
  tex2: {
    texture: 'float',
  },
  tex3: {
    texture: 'depth',
    multisampled: true,
  },
  tex4: {
    texture: 'uint',
    multisampled: true,
  },
  tex5: {
    texture: 'depth',
    viewDimension: 'cube-array',
  },
  tex6: {
    texture: 'depth',
    viewDimension: '2d-array',
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates sampler tgpu.bindGroupLayout definitions', () => {
    const wgsl = `
@group(2) @binding(0) var s1 : sampler;
@group(2) @binding(1) var s2 : sampler_comparison;
`;

    const expected = `\
export const layout2 = tgpu.bindGroupLayout({
  s1: {
    sampler: 'filtering',
  },
  s2: {
    sampler: 'comparison',
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates storage texture tgpu.bindGroupLayout definitions', () => {
    const wgsl = `
@group(1) @binding(0) var tex0: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(1) var tex1: texture_storage_3d<r8sint, read_write>;
`;

    const expected = `\
export const layout1 = tgpu.bindGroupLayout({
  tex0: {
    storageTexture: 'rgba8unorm',
    access: 'writeonly',
  },
  tex1: {
    storageTexture: 'r8sint',
    access: 'mutable',
    viewDimension: '3d',
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('puts in (_: null)s for missing bindings', () => {
    const wgsl = `
@binding(2) @group(0) var<uniform> u2: u32;
@binding(7) @group(0) var<uniform> u7: u32;
@binding(9) @group(0) var<uniform> u9: u32;
`;

    const expected = `\
export const layout0 = tgpu.bindGroupLayout({
  _0: null, // skipping binding 0
  _1: null, // skipping binding 1
  u2: {
    uniform: d.u32,
  },
  _3: null, // skipping binding 3
  _4: null, // skipping binding 4
  _5: null, // skipping binding 5
  _6: null, // skipping binding 6
  u7: {
    uniform: d.u32,
  },
  _8: null, // skipping binding 8
  u9: {
    uniform: d.u32,
  },
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates tgpu.bindGroupLayouts for each @group', () => {
    const wgsl = `
@group(0) @binding(0) var<uniform> u0: u32;
@group(2) @binding(0) var<storage> u2: u32;
@group(3) @binding(0) var<uniform> u3: u32;
`;

    const expected0 = `\
export const layout0 = tgpu.bindGroupLayout({
  u0: {
    uniform: d.u32,
  },
});`;

    const expected2 = `\
export const layout2 = tgpu.bindGroupLayout({
  u2: {
    storage: d.u32,
  },
});`;

    const expected3 = `\
export const layout3 = tgpu.bindGroupLayout({
  u3: {
    uniform: d.u32,
  },
});`;

    const generated = generate(wgsl);

    expect(generated).toContain(expected0);
    expect(generated).toContain(expected2);
    expect(generated).toContain(expected3);
  });

  it('adds typegpu import to the generated code', () => {
    const importStatement = "import tgpu from 'typegpu';";

    expect(generate('@binding(0) @group(0) var<uniform> a : f32;')).toContain(importStatement);
    expect(generate('')).not.toContain(importStatement);
  });
});

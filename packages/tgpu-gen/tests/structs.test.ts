import { describe, expect, it } from 'vitest';
import { generate } from '../gen.mjs';

describe('structs generator', () => {
  it('generates equivalent tgpu struct definitions from wgsl', () => {
    const wgsl = `
struct TriangleData {
  position: vec4f,
  velocity: vec2f,
  isRed: u32,
};`;

    const expected = `\
export const TriangleData = d.struct({
  position: d.vec4f,
  velocity: d.vec2f,
  isRed: d.u32,
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('respects align and size attributes', () => {
    const wgsl = `
struct TriangleData {
  @align(32) @size(32) position: vec4f,
  @size(64) velocity: vec2f,
};`;

    const expected = `\
export const TriangleData = d.struct({
  position: d.size(32, d.align(32, d.vec4f)),
  velocity: d.size(64, d.vec2f),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('respects align and size attributes for array members', () => {
    const wgsl = `
struct TriangleData {
  @align(32) @size(32) position: array<vec3f, 2>,
};`;

    const expected = `\
export const TriangleData = d.struct({
  position: d.size(32, d.align(32, d.arrayOf(d.vec3f, 2))),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('replaces member types with predeclared aliases', () => {
    const wgsl = `
struct Data {
  a1: vec2<i32>,
  a2: vec3<i32>,
  a3: vec4<i32>,
  a4: vec2<u32>,
  a5: vec3<u32>,
  a6: vec4<u32>,
  a7: vec2<f32>,
  a8: vec3<f32>,
  a9: vec4<f32>,
};`;

    const expected = `\
export const Data = d.struct({
  a1: d.vec2i,
  a2: d.vec3i,
  a3: d.vec4i,
  a4: d.vec2u,
  a5: d.vec3u,
  a6: d.vec4u,
  a7: d.vec2f,
  a8: d.vec3f,
  a9: d.vec4f,
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates structs with nested structs', () => {
    const wgsl = `
struct TriangleData {
  position: f32,
  @size(64) velocity: vec2f,
};

struct NewStruct {
  triangleData: TriangleData,
  triangleData2: TriangleData,
}`;

    const expected = `\
export const TriangleData = d.struct({
  position: d.f32,
  velocity: d.size(64, d.vec2f),
});

export const NewStruct = d.struct({
  triangleData: TriangleData,
  triangleData2: TriangleData,
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates structs with array members', () => {
    const wgsl = `
struct Vertex {
  vals: vec3 <f32>,
  _pad: f32,
};

struct Triangle {
  vertices: array<Vertex, 3>,
  color: array<u32, 7>,
};`;

    const expected = `\
export const Vertex = d.struct({
  vals: d.vec3f,
  _pad: d.f32,
});

export const Triangle = d.struct({
  vertices: d.arrayOf(Vertex, 3),
  color: d.arrayOf(d.u32, 7),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates structs with atomic members', () => {
    const wgsl = `
struct NewStruct {
  atomicX: atomic<u32>,
}`;

    const expected = `\
export const NewStruct = d.struct({
  atomicX: d.atomic(d.u32),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('throws for structs with members of unrecognized types', () => {
    const wgsl = `
struct NewStruct {
  x: T,
}`;

    expect(() => generate(wgsl)).toThrow();
  });

  it('generates functions for wgsl structs with buffer-tied-length arrays', () => {
    const wgsl = `
struct Vertex {
  vals: vec3 <f32>,
  _pad: f32,
};

struct Triangle {
  vertices: array<Vertex, 3>,
  color: array<u32, 3>,
};

@group(2) @binding(1)
var<storage, read> triangles: Triangles;

struct Triangles {
  tris: array<Triangle>,
};`;

    const expected = `\
export const Triangles = (arrayLength: number) => d.struct({
  tris: d.arrayOf(Triangle, arrayLength),
});`;

    expect(generate(wgsl)).toContain(expected);
  });

  it('generates untyped functions when generating plain JavaScript (non-TS) files', () => {
    const wgsl = `
struct Vertex {
  vals: vec3<f32>,
  _pad: f32,
};

struct Triangle {
  vertices: array<Vertex, 3>,
  color: array<u32, 3>,
};

@group(2) @binding(1)
var<storage, read> triangles: Triangles;

struct Triangles {
  tris: array<Triangle>,
};`;

    const expected = `\
export const Triangles = (arrayLength) => d.struct({
  tris: d.arrayOf(Triangle, arrayLength),
});`;

    expect(
      generate(wgsl, {
        inputPath: '',
        outputPath: '',
        toTs: false,
        moduleSyntax: 'esmodule',
        experimentalFunctions: false,
      }),
    ).toContain(expected);
  });

  it('generates CommonJS style imports and exports with moduleSyntax set to "commonjs"', () => {
    const wgsl = `
struct Vertex {
  vals: vec3<f32>,
  _pad: f32,
};

struct Triangle {
  vertices: array<Vertex, 3>,
  color: array<u32, 3>,
};

struct Triangles {
  tris: array<Triangle>,
};`;

    const generated = generate(wgsl, {
      inputPath: '',
      outputPath: '',
      toTs: true,
      moduleSyntax: 'commonjs',
      experimentalFunctions: false,
    });

    expect(generated).not.toContain(`\
export const Triangles = (arrayLength: number) => d.struct({
  tris: d.arrayOf(Triangle, arrayLength),
});`);

    expect(generated).toContain(`\
const Triangles = (arrayLength: number) => d.struct({
  tris: d.arrayOf(Triangle, arrayLength),
});`);

    expect(generated).not.toContain('export const Vertex = d.struct({');
    expect(generated).toContain('const Vertex = d.struct({');

    expect(generated).toContain("const d = require('typegpu/data');");
    expect(generated).not.toContain("import * as d from 'typegpu/data';");

    expect(generated).toContain('module.exports = {Vertex, Triangle, Triangles};');
  });

  it('sorts struct definitions topologically', () => {
    const wgsl = `
struct A {
  d: D,
};

struct C {
  a: A,
  b: array<B, 1>,
};

struct B {
  a: A,
};

struct D {
  x: u32,
};`;

    expect(generate(wgsl)).toMatch(/.*const D = .*const A = .*const B = .*const C = .*/s);
  });

  it('adds typegpu/data import to the generated code', () => {
    const importStatement = "import * as d from 'typegpu/data';";

    expect(generate('struct A { d: u32 };')).toContain(importStatement);
    expect(generate('')).not.toContain(importStatement);
  });
});

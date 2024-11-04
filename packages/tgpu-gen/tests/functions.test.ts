import { describe, expect, it } from 'vitest';
import { generate } from '../gen.mjs';

describe('functions generator', () => {
  it('generates function definitions from wgsl', () => {
    const wgsl = `\
fn rotate(v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
        (v.x * cos(angle)) - (v.y * sin(angle)),
        (v.x * sin(angle)) + (v.y * cos(angle)),
    );
    return pos;
}`;

    expect(generate(wgsl)).toContain(`\
export const rotate = tgpu
  .fn([d.vec2f, d.f32], d.vec2f)
  .implement(/* wgsl */ \`(v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
        (v.x * cos(angle)) - (v.y * sin(angle)),
        (v.x * sin(angle)) + (v.y * cos(angle)),
    );
    return pos;
}\`);`);
  });

  it('generates function with no arguments and return type', () => {
    const wgsl = `\
fn foo() {
    let x = vec3f();
}`;

    expect(generate(wgsl)).toContain(`\
export const foo = tgpu
  .fn([])
  .implement(/* wgsl */ \`() {
    let x = vec3f();
}\`);`);
  });

  it('generates entry vertex functions', () => {
    const wgsl = `\
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(1) color: vec4f,
};

@vertex
fn mainVert(@builtin(instance_index) ii: u32, @location(0) v: vec2f) -> VertexOutput {
    let instanceInfo = trianglePos[ii];

    let angle = getRotationFromVelocity(instanceInfo.velocity);
    let rotated = rotate(v, angle);

    let offset = instanceInfo.position;
    let pos = vec4(rotated + offset, 0.0, 1.0);

    let color = vec4(
        sin(angle + colorPalette.r) * 0.45 + 0.45,
        sin(angle + colorPalette.g) * 0.45 + 0.45,
        sin(angle + colorPalette.b) * 0.45 + 0.45,
        1.0
    );

    return VertexOutput(pos, color);
}`;

    expect(generate(wgsl)).toContain(`\
export const mainVert = tgpu
  .vertexFn([d.u32, d.vec2f], VertexOutput)
  .implement(/* wgsl */ \`(@builtin(instance_index) ii: u32, @location(0) v: vec2f) -> VertexOutput {
    let instanceInfo = trianglePos[ii];

    let angle = getRotationFromVelocity(instanceInfo.velocity);
    let rotated = rotate(v, angle);

    let offset = instanceInfo.position;
    let pos = vec4(rotated + offset, 0.0, 1.0);

    let color = vec4(
        sin(angle + colorPalette.r) * 0.45 + 0.45,
        sin(angle + colorPalette.g) * 0.45 + 0.45,
        sin(angle + colorPalette.b) * 0.45 + 0.45,
        1.0
    );

    return VertexOutput(pos, color);
}\`);`);
  });

  it('generates entry fragment functions', () => {
    const wgsl = `\
@fragment
fn mainFrag(@location(1) color: vec4f) -> @location(0) vec4f {
    return color;
}`;

    expect(generate(wgsl)).toContain(`\
export const mainFrag = tgpu
  .fragmentFn([d.vec4f], d.vec4f)
  .implement(/* wgsl */ \`(@location(1) color: vec4f) -> @location(0) vec4f {
    return color;
}\`);`);
  });

  it('adds tgpu import', () => {
    const wgsl = 'fn f() {}';
    expect(generate(wgsl)).toContain("import tgpu from 'typegpu';");
  });
});

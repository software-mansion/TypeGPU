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
export const rotate = tgpu['~unstable'].fn({v: d.vec2f, angle: d.f32}, d.vec2f)(/* wgsl */ \`{
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
export const foo = tgpu['~unstable'].fn({})(/* wgsl */ \`{
    let x = vec3f();
}\`);`);
  });

  it('adds tgpu import', () => {
    const wgsl = 'fn f() {}';
    expect(generate(wgsl)).toContain("import tgpu from 'typegpu';");
  });
});

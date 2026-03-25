import { describe, expect, it } from 'vitest';
import tgpu, { d } from 'typegpu';
import glslGenerator, { translateWgslTypeToGlsl } from '../src/glslGenerator.ts';

describe('translateWgslTypeToGlsl', () => {
  it('translates scalar types', () => {
    expect(translateWgslTypeToGlsl('f32')).toBe('float');
    expect(translateWgslTypeToGlsl('u32')).toBe('uint');
    expect(translateWgslTypeToGlsl('i32')).toBe('int');
    expect(translateWgslTypeToGlsl('bool')).toBe('bool');
  });

  it('translates float vector types', () => {
    expect(translateWgslTypeToGlsl('vec2f')).toBe('vec2');
    expect(translateWgslTypeToGlsl('vec3f')).toBe('vec3');
    expect(translateWgslTypeToGlsl('vec4f')).toBe('vec4');
  });

  it('translates uint vector types', () => {
    expect(translateWgslTypeToGlsl('vec2u')).toBe('uvec2');
    expect(translateWgslTypeToGlsl('vec3u')).toBe('uvec3');
    expect(translateWgslTypeToGlsl('vec4u')).toBe('uvec4');
  });

  it('translates int vector types', () => {
    expect(translateWgslTypeToGlsl('vec2i')).toBe('ivec2');
    expect(translateWgslTypeToGlsl('vec3i')).toBe('ivec3');
    expect(translateWgslTypeToGlsl('vec4i')).toBe('ivec4');
  });

  it('translates bool vector types', () => {
    expect(translateWgslTypeToGlsl('vec2<bool>')).toBe('bvec2');
    expect(translateWgslTypeToGlsl('vec3<bool>')).toBe('bvec3');
    expect(translateWgslTypeToGlsl('vec4<bool>')).toBe('bvec4');
  });

  it('translates matrix types', () => {
    expect(translateWgslTypeToGlsl('mat2x2f')).toBe('mat2');
    expect(translateWgslTypeToGlsl('mat3x3f')).toBe('mat3');
    expect(translateWgslTypeToGlsl('mat4x4f')).toBe('mat4');
  });

  it('returns unknown types unchanged', () => {
    expect(translateWgslTypeToGlsl('MyStruct')).toBe('MyStruct');
    expect(translateWgslTypeToGlsl('unknown_type')).toBe('unknown_type');
  });
});

describe('GlslGenerator - variable declarations', () => {
  it('generates GLSL-style variable declarations for JS function', () => {
    // 'use gpu' function - uses the TGSL code generation path, which calls functionDefinition
    const fragFn = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      // A variable that uses a vector type
      const color = d.vec4f(input.uv[0], input.uv[1], 0, 1);
      return color;
    });

    const result = tgpu.resolveWithContext([fragFn], { unstable_shaderGenerator: glslGenerator });
    // Should contain the resolved function code
    expect(result.code).toBeDefined();
    expect(result.code.length).toBeGreaterThan(0);
    // The variable declaration in the body should use GLSL type name
    expect(result.code).toContain('vec4 ');
    // Should not use the WGSL keyword `var`
    expect(result.code).not.toContain('var ');
  });

  it('translates f32 variable declaration to float', () => {
    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      const x = d.f32(1.0);
      return d.vec4f(x, 0, 0, 1);
    });

    const result = tgpu.resolveWithContext([fragFn], { unstable_shaderGenerator: glslGenerator });
    expect(result.code).toBeDefined();
    // Variable declaration for f32 should be `float`
    expect(result.code).toContain('float ');
  });
});

describe('GlslGenerator - functionDefinition post-processing', () => {
  it('translates WGSL type constructor calls in JS function body to GLSL', () => {
    const fragFn = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      return d.vec4f(input.uv[0], 0.0, 0.0, 1.0);
    });

    const result = tgpu.resolveWithContext([fragFn], { unstable_shaderGenerator: glslGenerator });
    // vec4f(...) in the body should become vec4(...)
    expect(result.code).toContain('vec4(');
    // Should not contain the WGSL-style constructor in the body
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);
  });

  it('translates vec3f to vec3 in function body', () => {
    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      const color = d.vec3f(1.0, 0.5, 0.0);
      return d.vec4f(color[0], color[1], color[2], 1.0);
    });

    const result = tgpu.resolveWithContext([fragFn], { unstable_shaderGenerator: glslGenerator });
    expect(result.code).toContain('vec3(');
    expect(result.code).not.toMatch(/\bvec3f\s*\(/);
    expect(result.code).toContain('vec4(');
  });
});

describe('GlslGenerator - entry point generation with JS functions', () => {
  it('resolves a vertex function using GLSL generator', () => {
    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })((_, Out) => {
      'use gpu';
      return Out({ pos: d.vec4f(0.0, 0.0, 0.0, 1.0) });
    });

    const result = tgpu.resolveWithContext([vertFn], { unstable_shaderGenerator: glslGenerator });
    expect(result.code).toBeDefined();
    expect(result.code.length).toBeGreaterThan(0);
    // The body should have translated type names
    expect(result.code).toContain('vec4(');
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);

    expect(result.code).toMatchInlineSnapshot(`
      "struct vertFn_Output {
        @builtin(position) pos: vec4,
      }

      @vertex fn vertFn() -> vertFn_Output {
        return vertFn_Output(vec4(0, 0, 0, 1));
      }"
    `);
  });

  it('resolves a fragment function returning a color using GLSL generator', () => {
    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      return d.vec4f(1.0, 0.0, 0.0, 1.0);
    });

    const result = tgpu.resolveWithContext([fragFn], { unstable_shaderGenerator: glslGenerator });
    expect(result.code).toBeDefined();
    // The body should have translated vec4f → vec4
    expect(result.code).toContain('vec4(');
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);

    expect(result.code).toMatchInlineSnapshot(`
      "@fragment fn fragFn() -> @location(0) vec4 {
        return vec4(1, 0, 0, 1);
      }"
    `);
  });
});

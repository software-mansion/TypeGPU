import { beforeEach, describe, expect, it } from 'vitest';
import tgpu, { d } from 'typegpu';
import { GLOptions, initWithGL } from '@typegpu/gl';
import { translateWgslTypeToGlsl } from '../src/glslGenerator.ts';
import { _resetUniformCounter } from '../src/tgpuRootWebGL.ts';
import { it as glIt } from './utils/extendedTest.ts';

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
    const main = () => {
      'use gpu';
      // A variable that uses a vector type
      const color = d.vec4f(1, 0, 0, 1);
      return color;
    };

    const result = tgpu.resolveWithContext([main], GLOptions());
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

    const result = tgpu.resolveWithContext([fragFn], GLOptions());
    expect(result.code).toBeDefined();
    // Variable declaration for f32 should be `float`
    expect(result.code).toContain('float ');
  });
});

describe('GlslGenerator - function definitions', () => {
  it('generates proper function signatures', () => {
    function add(a: number, b: number) {
      'use gpu';
      return a + b;
    }

    function main() {
      'use gpu';
      return add(1.5, 1.2);
    }

    const result = tgpu.resolveWithContext([main], GLOptions());

    expect(result.code).toMatchInlineSnapshot(`
      "float add(float a, float b) {
        return (a + b);
      }

      float main() {
        return add(1.5f, 1.2f);
      }"
    `);
  });

  it('translates vec3f to vec3 in function body', () => {
    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      const color = d.vec3f(1.0, 0.5, 0.0);
      return d.vec4f(color[0], color[1], color[2], 1.0);
    });

    const result = tgpu.resolveWithContext([fragFn], GLOptions());
    expect(result.code).toContain('vec3(');
    expect(result.code).not.toMatch(/\bvec3f\s*\(/);
    expect(result.code).toContain('vec4(');
  });

  it('generates proper struct definition', () => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3f,
    });

    function createBoid() {
      'use gpu';
      return Boid({ pos: d.vec3f(), vel: d.vec3f(0, 1, 0) });
    }

    function main() {
      'use gpu';
      const boid = createBoid();
    }

    const result = tgpu.resolve([main], GLOptions());
    expect(result).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      Boid createBoid() {
        return Boid(vec3(), vec3(0, 1, 0));
      }

      void main() {
        Boid boid = createBoid();
      }"
    `);
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

    const result = tgpu.resolveWithContext([vertFn], GLOptions());
    expect(result.code).toBeDefined();
    expect(result.code.length).toBeGreaterThan(0);
    // The body should have translated type names
    expect(result.code).toContain('vec4(');
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);

    expect(result.code).toMatchInlineSnapshot(`
      "struct vertFn_Output {
        vec4 pos;
      };

      void main() {
        return vertFn_Output(vec4(0, 0, 0, 1));
      }"
    `);
  });

  it('resolves a vertex function returning a builtin and varying', () => {
    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        uv: d.vec2f,
      },
    })(() => {
      'use gpu';
      const position = d.vec4f();
      const uv = d.vec2f();

      // NOTE: Don't wrap when assigning variables
      // is valid and allowed at most once
      return {
        position: d.vec4f(position),
        uv: d.vec2f(uv),
      };
    });

    const result = tgpu.resolve([vertFn], GLOptions());

    expect(result).toMatchInlineSnapshot(`
      "out vec2 vary_uv;

      void main() {
        vec4 position = vec4();
        vec2 uv = vec2();
        {
          gl_Position = vec4(position);
          vary_uv = vec2(uv);
          return;
        }
      }"
    `);
  });

  it('resolves a fragment function returning a color using GLSL generator', () => {
    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      // This variable should get renamed to not conflict with
      // the global.
      const gl_Position = 1;
      return d.vec4f(1.0, 0.0, 0.0, 1.0);
    });

    const result = tgpu.resolveWithContext([fragFn], GLOptions());
    expect(result.code).toBeDefined();
    expect(result.code).toContain('vec4(');
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);

    expect(result.code).toMatchInlineSnapshot(`
      "layout(location = 0) out vec4 _fragColor;

      void main() {
        int gl_Position_1 = 1;
        {
          _fragColor = vec4(1, 0, 0, 1);
          return;
        }
      }"
    `);
  });
});

describe('GlslGenerator - uniform resolution', () => {
  beforeEach(() => {
    _resetUniformCounter();
  });

  glIt('emits a uniform declaration and references the name in shader body', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return time.$;
    };

    const result = tgpu.resolve([fn], GLOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float _u0;

      float fn() {
        return _u0;
      }"
    `);
  });

  glIt('emits a vec3f uniform as vec3', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = root.createUniform(d.vec3f);

    const fn = () => {
      'use gpu';
      return color.$;
    };

    const result = tgpu.resolve([fn], GLOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform vec3 _u0;

      vec3 fn() {
        return _u0;
      }"
    `);
  });

  glIt('emits multiple uniforms with sequential names', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const scale = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return time.$ * scale.$;
    };

    const result = tgpu.resolve([fn], GLOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float _u0;

      uniform float _u1;

      float fn_1() {
        return (_u0 * _u1);
      }"
    `);
  });

  glIt('emits a mat2x2f uniform as mat2', ({ gl }) => {
    const root = initWithGL({ gl });
    const transform = root.createUniform(d.mat2x2f);

    const fn = (v: d.v2f) => {
      'use gpu';
      return transform.$ * v;
    };

    const result = tgpu.resolve([fn], GLOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform mat2 _u0;

      vec2 fn(vec2 v) {
        return (_u0 * v);
      }"
    `);
  });
});

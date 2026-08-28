import { describe, expect, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { dualGlOptions, glOptions } from '@typegpu/gl';
import { translateWgslTypeToGlsl } from '../src/glslGenerator.ts';
import { it } from './utils/extendedTest.ts';

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

describe('GlslGenerator', () => {
  it('reports "glsl" as the language', () => {
    function foo() {
      'use gpu';
      return std.getTargetShaderLanguage() === 'glsl';
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "bool foo() {
        return true;
      }"
    `);
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

    const result = tgpu.resolveWithContext([main], glOptions());
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

    const options = dualGlOptions();
    const result = tgpu.resolveWithContext([fragFn], options.fragment);
    expect(result.code).toBeDefined();
    // Variable declaration for f32 should be `float`
    expect(result.code).toContain('float ');
  });

  it('generates proper array constructor for 1d, 2d and 3d arrays', () => {
    function foo() {
      'use gpu';
      const arr1 = d.arrayOf(d.f32, 2)();
      const arr2 = d.arrayOf(d.arrayOf(d.f32, 2), 2)();
      const arr3 = d.arrayOf(d.arrayOf(d.arrayOf(d.f32, 2), 2), 2)();
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "void foo() {
        float arr1[2] = float[2](0.0, 0.0);
        float arr2[2][2] = float[2][2](float[2](0.0, 0.0), float[2](0.0, 0.0));
        float arr3[2][2][2] = float[2][2][2](float[2][2](float[2](0.0, 0.0), float[2](0.0, 0.0)), float[2][2](float[2](0.0, 0.0), float[2](0.0, 0.0)));
      }"
    `);
  });
});

describe('GlslGenerator - standard function calls', () => {
  it('translates textureLoad() to texelFetch()', () => {
    const texture = tgpu['~unstable'].rawCodeSnippet('palette', d.texture2d(), 'handle');

    function loadTexel() {
      'use gpu';
      return std.textureLoad(texture.$, d.vec2i(2, 3), 0);
    }

    expect(tgpu.resolve([loadTexel], glOptions())).toMatchInlineSnapshot(`
      "vec4 loadTexel() {
        return texelFetch(palette, ivec2(2, 3), 0);
      }"
    `);
  });

  it('translates textureSample() to texture() with the combined sampler', () => {
    const texture = tgpu['~unstable'].rawCodeSnippet('palette', d.texture2d(), 'handle');
    const sampler = tgpu['~unstable'].rawCodeSnippet('paletteSampler', d.sampler(), 'handle');

    function sampleTexture() {
      'use gpu';
      return std.textureSample(texture.$, sampler.$, d.vec2f(0.25, 0.75));
    }

    expect(tgpu.resolve([sampleTexture], glOptions())).toMatchInlineSnapshot(`
      "vec4 sampleTexture() {
        return texture(palette, vec2(0.25, 0.75));
      }"
    `);
  });

  it('combines coordinates and array index when sampling a 2d-array texture', () => {
    const texture = tgpu['~unstable'].rawCodeSnippet('palette', d.texture2dArray(), 'handle');
    const sampler = tgpu['~unstable'].rawCodeSnippet('paletteSampler', d.sampler(), 'handle');

    function sampleTextureArray() {
      'use gpu';
      std.textureSample(texture.$, sampler.$, d.vec2f(0.25, 0.75), 2);
      std.textureSample(texture.$, sampler.$, d.vec2f(0.25, 0.75), 2, d.vec2i(1, -1));
    }

    expect(tgpu.resolve([sampleTextureArray], glOptions())).toMatchInlineSnapshot(`
      "void sampleTextureArray() {
        texture(palette, vec3(vec2(0.25, 0.75), 2));
        textureOffset(palette, vec3(vec2(0.25, 0.75), 2), ivec2(1, -1));
      }"
    `);
  });

  it('preserves bias and offset when sampling a 2d-array texture', () => {
    const texture = tgpu['~unstable'].rawCodeSnippet('palette', d.texture2dArray(), 'handle');
    const sampler = tgpu['~unstable'].rawCodeSnippet('paletteSampler', d.sampler(), 'handle');

    function sampleTextureArrayWithBias() {
      'use gpu';
      return std.textureSampleBias(
        texture.$,
        sampler.$,
        d.vec2f(0.25, 0.75),
        2,
        0.5,
        d.vec2i(1, -1),
      );
    }

    expect(tgpu.resolve([sampleTextureArrayWithBias], glOptions())).toMatchInlineSnapshot(`
      "vec4 sampleTextureArrayWithBias() {
        return textureOffset(palette, vec3(vec2(0.25, 0.75), 2), ivec2(1, -1), 0.5);
      }"
    `);
  });

  it('preserves level and offset when sampling a 2d-array texture', () => {
    const texture = tgpu['~unstable'].rawCodeSnippet('palette', d.texture2dArray(), 'handle');
    const sampler = tgpu['~unstable'].rawCodeSnippet('paletteSampler', d.sampler(), 'handle');

    function sampleTextureArrayAtLevel() {
      'use gpu';
      return std.textureSampleLevel(
        texture.$,
        sampler.$,
        d.vec2f(0.25, 0.75),
        2,
        1,
        d.vec2i(1, -1),
      );
    }

    expect(tgpu.resolve([sampleTextureArrayAtLevel], glOptions())).toMatchInlineSnapshot(`
      "vec4 sampleTextureArrayAtLevel() {
        return textureLodOffset(palette, vec3(vec2(0.25, 0.75), 2), 1, ivec2(1, -1));
      }"
    `);
  });

  it('translates scalar `select()` to ternary expression', () => {
    function foo() {
      'use gpu';
      const cond = false;
      return std.select(0, 1, cond);
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "int foo() {
        bool cond = false;
        return (cond ? 1 : 0);
      }"
    `);
  });

  it('translates vector `select()` to mix()', () => {
    function foo() {
      'use gpu';
      const cond = false;
      const vecCond = d.vec3b(false, true, false);
      const bar = std.select(d.vec3f(0), d.vec3f(1), cond); // `cond` should be coerced to a boolean vector
      const baz = std.select(d.vec3f(1), d.vec3f(0), vecCond);
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "void foo() {
        bool cond = false;
        bvec3 vecCond = bvec3(false, true, false);
        vec3 bar = mix(vec3(0), vec3(1), bvec3(cond));
        vec3 baz = mix(vec3(1), vec3(0), vecCond);
      }"
    `);
  });

  it('should throw on select() with vector cond and scalar branches', () => {
    function foo() {
      'use gpu';
      const cond = d.vec3b(false, true, false);
      // @ts-ignore
      return std.select(0, 1, cond);
    }

    expect(() => tgpu.resolve([foo], glOptions())).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo()
      - fn:select: GLSL select() with scalar branches requires a scalar boolean condition]
    `);
  });

  it('translates `saturate(v)` to `clamp(v, 0.0, 1.0)`', () => {
    function foo() {
      'use gpu';
      const scalar = 2;
      const vec3 = d.vec3f(1, 2, 3);
      std.saturate(scalar);
      std.saturate(vec3);
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "void foo() {
        int scalar = 2;
        vec3 vec3_1 = vec3(1, 2, 3);
        clamp(float(scalar), 0.0, 1.0);
        clamp(vec3_1, 0.0, 1.0);
      }"
    `);
  });

  it('translates bitcast', () => {
    function foo() {
      'use gpu';
      const f = d.f32(1.5);
      const f2 = d.vec2f(1.5);
      const u = d.u32(15);
      const u2 = d.vec2u(15);
      const i = d.i32(-5);
      const i2 = d.vec2i(-5);

      std.bitcast(d.f32, d.f32)(f); //no-op
      std.bitcast(d.u32, d.u32)(u); //no-op
      std.bitcast(d.i32, d.i32)(i); //no-op

      std.bitcast(d.f32, d.u32)(f);
      std.bitcast(d.f32, d.i32)(f);
      std.bitcast(d.u32, d.f32)(u);
      std.bitcast(d.i32, d.f32)(i);

      std.bitcast(d.vec2f, d.vec2u)(f2);
      std.bitcast(d.vec2f, d.vec2i)(f2);
      std.bitcast(d.vec2u, d.vec2f)(u2);
      std.bitcast(d.vec2i, d.vec2f)(i2);
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "void foo() {
        float f = 1.5;
        vec2 f2 = vec2(1.5);
        uint u = 15u;
        uvec2 u2 = uvec2(15);
        int i = -5;
        ivec2 i2 = ivec2(-5);
        f;
        u;
        i;
        floatBitsToUint(f);
        floatBitsToInt(f);
        uintBitsToFloat(u);
        intBitsToFloat(i);
        floatBitsToUint(f2);
        floatBitsToInt(f2);
        uintBitsToFloat(u2);
        intBitsToFloat(i2);
      }"
    `);
  });
});

describe('GlslGenerator - operator', () => {
  it('translates % with floating-point arguments to a call to the `remainder` helper function', () => {
    function foo() {
      'use gpu';
      const value = 2;
      const rem = value % 5;
      return (1 + rem) % 0.5;
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "float remainder(float x, float y) {
        float truncDiv = (sign((x / y)) * floor(abs((x / y))));
        return (x - (y * truncDiv));
      }

      float foo() {
        int value = 2;
        int rem = (value % 5);
        return remainder(float((1 + rem)), 0.5);
      }"
    `);
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

    const result = tgpu.resolveWithContext([main], glOptions());

    expect(result.code).toMatchInlineSnapshot(`
      "float add(float a, float b) {
        return (a + b);
      }

      float main() {
        return add(1.5, 1.2);
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

    const options = dualGlOptions();
    const result = tgpu.resolveWithContext([fragFn], options.fragment);
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

    const result = tgpu.resolve([main], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      Boid createBoid() {
        return Boid(vec3(0), vec3(0, 1, 0));
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

    const options = dualGlOptions();
    const result = tgpu.resolveWithContext([vertFn], options.vertex);
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

    const options = dualGlOptions();
    const result = tgpu.resolve([vertFn], options.vertex);

    expect(result).toMatchInlineSnapshot(`
      "out vec2 vary_uv;

      void main() {
        vec4 position = vec4(0);
        vec2 uv = vec2(0);
        {
          gl_Position = position;
          vary_uv = uv;
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
      return d.vec4f(1.0, 0.0, 0.0, 1.0);
    });

    const options = dualGlOptions();
    const result = tgpu.resolveWithContext([fragFn], options.fragment);
    expect(result.code).toBeDefined();
    expect(result.code).toContain('vec4(');
    expect(result.code).not.toMatch(/\bvec4f\s*\(/);

    expect(result.code).toMatchInlineSnapshot(`
      "layout(location=0) out vec4 _fragColor;

      void main() {
        _fragColor = vec4(1, 0, 0, 1);
      }"
    `);
  });

  it('fails when defining a global constant starting with gl_', () => {
    const constant = tgpu.const(d.vec3f, d.vec3f(1, 2, 3)).$name('gl_color');
    function foo() {
      'use gpu';
      return d.vec3f(constant.$);
    }

    expect(() => tgpu.resolve([foo], glOptions())).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo()
      - const:gl_color.$
      - const:gl_color: User-defined constants cannot start with 'gl_']
    `);
  });

  it('fails when defining a global variable starting with gl_', () => {
    const globalVar = tgpu.privateVar(d.vec3f).$name('gl_color');

    function foo() {
      'use gpu';
      return d.vec3f(globalVar.$);
    }

    expect(() => tgpu.resolve([foo], glOptions())).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo()
      - var:gl_color.$
      - var:gl_color: User-defined variables cannot start with 'gl_']
    `);
  });

  it('fails when defining a local variable starting with gl_', () => {
    function foo() {
      'use gpu';
      const gl_color = d.vec4f(1, 0, 0, 1);
      return gl_color;
    }

    expect(() => tgpu.resolve([foo], glOptions())).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): User-defined variables cannot start with 'gl_']
    `);
  });

  it('resolves computed properties in entry point return', () => {
    const positionKey = 'position' as const;
    const getUvKey = tgpu.comptime(() => 'uv' as const);

    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        uv: d.vec2f,
      },
    })(() => {
      'use gpu';
      return {
        [positionKey]: d.vec4f(0, 0, 0, 1),
        [getUvKey()]: d.vec2f(1, 2),
      };
    });

    expect(tgpu.resolve([vertFn], dualGlOptions().vertex)).toMatchInlineSnapshot(`
      "out vec2 vary_uv;

      void main() {
        {
          gl_Position = vec4(0, 0, 0, 1);
          vary_uv = vec2(1, 2);
          return;
        }
      }"
    `);
  });

  it('evaluates object properties in the order they are written in entry point return', () => {
    using consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const fieldX = tgpu.comptime(() => {
      console.log('fieldX');
      return 6;
    });
    const fieldY = tgpu.comptime(() => {
      console.log('fieldY');
      return 7;
    });

    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        x: d.u32,
        y: d.u32,
      },
    })(() => {
      'use gpu';
      return {
        position: d.vec4f(),
        y: d.u32(fieldY()),
        x: d.u32(fieldX()),
      };
    });

    void tgpu.resolve([vertFn], dualGlOptions().vertex);

    expect(consoleLogSpy.mock.calls).toEqual([['fieldY'], ['fieldX']]);
  });

  it('evaluates extra properties in entry point return before stripping them', () => {
    using consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const fieldX = tgpu.comptime(() => {
      console.log('fieldX');
      return 6;
    });
    const extraKey = tgpu.comptime(() => {
      console.log('extraKey');
      return 'extra' as const;
    });
    const extraField = tgpu.comptime(() => {
      console.log('extraField');
      return 8;
    });
    const fieldY = tgpu.comptime(() => {
      console.log('fieldY');
      return 7;
    });

    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        x: d.u32,
        y: d.u32,
      },
    })(() => {
      'use gpu';
      return {
        position: d.vec4f(),
        x: d.u32(fieldX()),
        [extraKey()]: d.u32(extraField()),
        y: d.u32(fieldY()),
      };
    });

    const result = tgpu.resolve([vertFn], dualGlOptions().vertex);

    expect(result).not.toContain('extra');
    expect(consoleLogSpy.mock.calls).toEqual([
      ['fieldX'],
      ['extraKey'],
      ['extraField'],
      ['fieldY'],
    ]);
  });

  it('preserves JS evaluation order in entry point return', () => {
    using consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const key1 = tgpu.comptime(() => {
      console.log('key1');
      return 'x' as const;
    });
    const key2 = tgpu.comptime(() => {
      console.log('key2');
      return 'y' as const;
    });
    const field1 = tgpu.comptime(() => {
      console.log('field1');
      return 6;
    });
    const field2 = tgpu.comptime(() => {
      console.log('field2');
      return 7;
    });

    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        x: d.u32,
        y: d.u32,
      },
    })(() => {
      'use gpu';
      return {
        position: d.vec4f(),
        [key1()]: d.u32(field1()),
        [key2()]: d.u32(field2()),
      };
    });

    void tgpu.resolve([vertFn], dualGlOptions().vertex);

    expect(consoleLogSpy.mock.calls).toEqual([['key1'], ['field1'], ['key2'], ['field2']]);
  });

  it('rejects duplicate keys in entry point return', () => {
    const getKey = tgpu.comptime(() => 'uv' as const);

    const vertFn = tgpu.vertexFn({
      out: {
        position: d.builtin.position,
        uv: d.vec2f,
      },
    })(() => {
      'use gpu';
      return {
        position: d.vec4f(),
        uv: d.vec2f(1, 2),
        // @ts-ignore
        [getKey()]: d.vec2f(3, 4),
      };
    });

    expect(() => tgpu.resolve([vertFn], dualGlOptions().vertex))
      .toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:vertFn: Duplicate object property key: 'uv'.]
    `);
  });
});

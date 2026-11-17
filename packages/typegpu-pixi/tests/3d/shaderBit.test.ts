import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import * as p3d from '@typegpu/pixi/3d';

const hash = tgpu.fn(
  [d.vec2f],
  d.f32,
)((p) => {
  'use gpu';
  return std.fract(std.sin(std.dot(p, d.vec2f(12.9898, 78.233))) * 43758.5453);
});

describe('shaderBit', () => {
  it('generates a slot in WGSL and GLSL from one function', () => {
    const contourUniforms = p3d.uniforms({
      lowColor: d.vec3f,
      highColor: d.vec3f,
      frequency: d.f32,
    });

    const bit = p3d.shaderBit({
      name: 'contour',
      uniforms: contourUniforms,
      fragment: {
        material: () => {
          'use gpu';
          const wave = std.sin(
            p3d.fragment.worldPosition.$.y * contourUniforms.$.frequency - p3d.time.$ * 2,
          );
          p3d.fragment.albedo.$ *= std.mix(
            contourUniforms.$.lowColor,
            contourUniforms.$.highColor,
            std.step(0, wave),
          );
        },
      },
    });

    expect(bit.name).toBe('contour');
    expect(bit.bindings).toStrictEqual({
      material: { lowColor: 'vec3<f32>', highColor: 'vec3<f32>', frequency: 'f32' },
    });

    expect(bit.gpu?.header).toMatchInlineSnapshot(`
      "var<private> contour_fragment_worldPosition: vec3f;

      var<private> contour_frequency: f32;

      var<private> contour_time: f32;

      var<private> contour_lowColor: vec3f;

      var<private> contour_highColor: vec3f;

      var<private> contour_fragment_albedo: vec3f;

      fn contour_material() {
        let wave = sin(((contour_fragment_worldPosition.y * contour_frequency) - (contour_time * 2f)));
        contour_fragment_albedo *= mix(contour_lowColor, contour_highColor, step(0f, wave));
      }"
    `);
    expect(bit.gpu?.fragment?.material).toMatchInlineSnapshot(`
      "{
        contour_fragment_worldPosition = input.vPosition;
        contour_frequency = material.frequency;
        contour_time = global.uTime;
        contour_fragment_albedo = albedo;
        contour_lowColor = material.lowColor;
        contour_highColor = material.highColor;
        contour_material();
        albedo = contour_fragment_albedo;
      }"
    `);
    expect(bit.gpu?.vertex).toBeUndefined();

    expect(bit.gl?.fragment?.header).toMatchInlineSnapshot(`
      "vec3 contour_fragment_worldPosition;

      float contour_frequency;

      float contour_time;

      vec3 contour_lowColor;

      vec3 contour_highColor;

      vec3 contour_fragment_albedo;

      void contour_material() {
        float wave = sin(((contour_fragment_worldPosition.y * contour_frequency) - (contour_time * 2.0)));
        contour_fragment_albedo *= mix(contour_lowColor, contour_highColor, step(0.0, wave));
      }"
    `);
    expect(bit.gl?.fragment?.material).toMatchInlineSnapshot(`
      "{
        contour_fragment_worldPosition = vPosition;
        contour_frequency = material.frequency;
        contour_time = uTime;
        contour_fragment_albedo = albedo;
        contour_lowColor = material.lowColor;
        contour_highColor = material.highColor;
        contour_material();
        albedo = contour_fragment_albedo;
      }"
    `);
    expect(bit.gl?.vertex).toBeUndefined();
    // PixiJS 3D pastes `gl.header` into both stages, so nothing goes there
    expect(bit.gl?.header).toBeUndefined();
  });

  it('writes back only the values that can change', () => {
    const bit = p3d.shaderBit({
      name: 'lift',
      vertex: {
        beforeTransform: () => {
          'use gpu';
          p3d.vertex.position.$ = d.vec4f(
            p3d.vertex.position.$.xyz + p3d.vertex.normal.$ * std.sin(p3d.time.$),
            1,
          );
        },
      },
    });

    expect(bit.bindings).toBeUndefined();
    expect(bit.gpu?.vertex?.beforeTransform).toMatchInlineSnapshot(`
      "{
        lift_vertex_position = position;
        lift_vertex_normal = normal;
        lift_time = global.uTime;
        lift_beforeTransform();
        position = lift_vertex_position;
        normal = lift_vertex_normal;
      }"
    `);
    expect(bit.gl?.vertex?.beforeTransform).toMatchInlineSnapshot(`
      "{
        lift_vertex_position = position;
        lift_vertex_normal = normal;
        lift_time = uTime;
        lift_beforeTransform();
        position = lift_vertex_position;
        normal = lift_vertex_normal;
      }"
    `);
  });

  it('tracks what a slot reads through the functions it calls', () => {
    const pulseUniforms = p3d.uniforms({ speed: d.f32 });

    const pulse = () => {
      'use gpu';
      return 0.5 + 0.5 * std.sin(p3d.time.$ * pulseUniforms.$.speed);
    };

    const bit = p3d.shaderBit({
      name: 'pulse',
      uniforms: pulseUniforms,
      fragment: {
        // Both slots call `pulse`, and each has to pass the time and the speed along
        material: () => {
          'use gpu';
          p3d.fragment.albedo.$ *= pulse();
        },
        end: () => {
          'use gpu';
          p3d.fragment.finalColor.$ += pulse() * 0.1;
        },
      },
    });

    expect(bit.gpu?.fragment?.material).toMatchInlineSnapshot(`
      "{
        pulse_fragment_albedo = albedo;
        pulse_time = global.uTime;
        pulse_speed = material.speed;
        pulse_material();
        albedo = pulse_fragment_albedo;
      }"
    `);
    expect(bit.gpu?.fragment?.end).toMatchInlineSnapshot(`
      "{
        pulse_fragment_finalColor = finalColor;
        pulse_time = global.uTime;
        pulse_speed = material.speed;
        pulse_end();
        finalColor = pulse_fragment_finalColor;
      }"
    `);
  });

  it('shares helpers between the stages in WGSL, and repeats them per stage in GLSL', () => {
    const bit = p3d.shaderBit({
      name: 'grain',
      vertex: {
        beforeTransform: () => {
          'use gpu';
          p3d.vertex.uv.$ += hash(p3d.vertex.uv.$) * 0.01;
        },
      },
      fragment: {
        end: () => {
          'use gpu';
          p3d.fragment.finalColor.$ += hash(p3d.fragment.uv.$) * 0.01;
        },
      },
    });

    expect(bit.gpu?.header?.match(/fn grain_hash\(/g)).toHaveLength(1);
    expect(bit.gl?.vertex?.header).toContain('float grain_hash(vec2 p)');
    expect(bit.gl?.fragment?.header).toContain('float grain_hash(vec2 p)');
  });

  it('prefixes every generated name with the name of the bit', () => {
    const Light = d.struct({ color: d.vec3f, color2: d.vec3f });
    const TINT = tgpu.const(d.vec3f, d.vec3f(1, 0.5, 0.25));

    // Named like a field of `Light`, and like values PixiJS declares in its own shader
    const color = (light: d.Infer<typeof Light>) => {
      'use gpu';
      return light.color * light.color2 * TINT.$;
    };
    const albedo = () => {
      'use gpu';
      return color(Light({ color: d.vec3f(1), color2: d.vec3f(0.5) }));
    };

    const bit = p3d.shaderBit({
      name: 'my bit/2',
      fragment: {
        material: () => {
          'use gpu';
          p3d.fragment.albedo.$ = albedo();
        },
      },
    });

    expect(bit.gpu?.header).toMatchInlineSnapshot(`
      "struct my_bit_2_Light {
        color: vec3f,
        color2: vec3f,
      }

      const my_bit_2_TINT: vec3f = vec3f(1, 0.5, 0.25);

      fn my_bit_2_color(light: my_bit_2_Light) -> vec3f {
        return ((light.color * light.color2) * my_bit_2_TINT);
      }

      fn my_bit_2_albedo() -> vec3f {
        return my_bit_2_color(my_bit_2_Light(vec3f(1), vec3f(0.5)));
      }

      var<private> my_bit_2_fragment_albedo: vec3f;

      fn my_bit_2_material() {
        my_bit_2_fragment_albedo = my_bit_2_albedo();
      }"
    `);
    expect(bit.gl?.fragment?.header).toMatchInlineSnapshot(`
      "struct my_bit_2_Light {
        vec3 color;
        vec3 color2;
      };

      const vec3 my_bit_2_TINT = vec3(1, 0.5, 0.25);

      vec3 my_bit_2_color(my_bit_2_Light light) {
        return ((light.color * light.color2) * my_bit_2_TINT);
      }

      vec3 my_bit_2_albedo() {
        return my_bit_2_color(my_bit_2_Light(vec3(1), vec3(0.5)));
      }

      vec3 my_bit_2_fragment_albedo;

      void my_bit_2_material() {
        my_bit_2_fragment_albedo = my_bit_2_albedo();
      }"
    `);
    expect(bit.gpu?.fragment?.material).toMatchInlineSnapshot(`
      "{
        my_bit_2_fragment_albedo = albedo;
        my_bit_2_material();
        albedo = my_bit_2_fragment_albedo;
      }"
    `);
  });

  it('only generates code for the chosen backend', () => {
    const material = () => {
      'use gpu';
      p3d.fragment.alpha.$ = 0.5;
    };

    const gpuOnly = p3d.shaderBit({ name: 'gpuOnly', backend: 'gpu', fragment: { material } });
    expect(gpuOnly.gpu).toBeDefined();
    expect(gpuOnly.gl).toBeUndefined();

    const glOnly = p3d.shaderBit({ name: 'glOnly', backend: 'gl', fragment: { material } });
    expect(glOnly.gpu).toBeUndefined();
    expect(glOnly.gl).toBeDefined();
  });

  it('is a plain object that PixiJS 3D can snapshot', () => {
    const bit = p3d.shaderBit({
      name: 'plain',
      fragment: {
        material: () => {
          'use gpu';
          p3d.fragment.alpha.$ = 0.5;
        },
      },
    });

    // PixiJS 3D compares bits that share a name by their JSON
    expect(JSON.parse(JSON.stringify(bit))).toStrictEqual(bit);
  });

  it('passes `requires` through', () => {
    const helperBit = { name: 'helper', gpu: { header: '' }, gl: { header: '' } };
    const bit = p3d.shaderBit({ name: 'needy', requires: [helperBit] });
    expect(bit.requires).toStrictEqual([helperBit]);
  });

  it('rejects a fragment value in a vertex slot', () => {
    expect(() =>
      p3d.shaderBit({
        name: 'confused',
        vertex: {
          beforeTransform: () => {
            'use gpu';
            p3d.fragment.albedo.$ = d.vec3f(1);
          },
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:beforeTransform
      - fn*:beforeTransform(): [@typegpu/pixi] \`fragment.albedo\` only exists in the fragment stage, but the shader bit 'confused' reads it in a vertex slot.]
    `);
  });

  it("rejects uniforms that aren't the bit's own", () => {
    const others = p3d.uniforms({ amount: d.f32 });

    expect(() =>
      p3d.shaderBit({
        name: 'borrower',
        fragment: {
          material: () => {
            'use gpu';
            p3d.fragment.alpha.$ = others.$.amount;
          },
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:material
      - fn*:material(): [@typegpu/pixi] The shader bit 'borrower' reads the uniform 'amount', which isn't one of its own. Pass the uniforms it reads as its \`uniforms\`.]
    `);
  });

  it("rejects uniform types a material can't hold", () => {
    expect(() =>
      p3d.shaderBit({ name: 'matrix', uniforms: p3d.uniforms({ transform: d.mat4x4f }) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] The uniform 'transform' of the shader bit 'matrix' is a mat4x4f, but a material's values can only be f32, i32, u32, vec2f, vec3f, vec4f or mat2x2f.]`,
    );
  });

  it('rejects TypeGPU resources, which PixiJS would not bind', () => {
    const layout = tgpu.bindGroupLayout({ amount: { uniform: d.f32 } });

    expect(() =>
      p3d.shaderBit({
        name: 'buffered',
        fragment: {
          material: () => {
            'use gpu';
            p3d.fragment.alpha.$ = layout.$.amount;
          },
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] The shader bit 'buffered' reads a TypeGPU buffer, texture or bind group layout, and PixiJS 3D binds everything in its shaders by itself. Pass values through \`uniforms\`, and give a material's shader bits their textures through \`textureSlot\`.]`,
    );
  });

  it("samples a material's textures through texture slots", () => {
    const heightMap = p3d.textureSlot('heightMap');
    const detail = p3d.textureSlot('detail');

    const height = (uv: d.v2f) => {
      'use gpu';
      return heightMap.sampleDirect(uv).r;
    };

    const bit = p3d.shaderBit({
      name: 'terrain',
      vertex: {
        beforeTransform: () => {
          'use gpu';
          const lift = p3d.vertex.normal.$ * height(p3d.vertex.uv.$);
          p3d.vertex.position.$ += d.vec4f(lift, 0);
        },
      },
      fragment: {
        material: () => {
          'use gpu';
          const uv = p3d.fragment.uv.$;
          p3d.fragment.albedo.$ = detail.sample(uv * 8).rgb * height(uv);
        },
      },
    });

    // In the order the slots are first sampled
    expect(bit.textures).toStrictEqual(['heightMap', 'detail']);
    expect(bit.gpu?.header).toMatchInlineSnapshot(`
      "fn terrain_sampleDirect_heightMap(_pixiUv: vec2f) -> vec4f {
        return sampleHeightMapDirect(_pixiUv);
      }

      fn terrain_height(uv: vec2f) -> f32 {
        return terrain_sampleDirect_heightMap(uv).r;
      }

      var<private> terrain_vertex_uv: vec2f;

      var<private> terrain_vertex_normal: vec3f;

      var<private> terrain_vertex_position: vec4f;

      fn terrain_beforeTransform() {
        let lift = (terrain_vertex_normal * terrain_height(terrain_vertex_uv));
        terrain_vertex_position += vec4f(lift, 0f);
      }

      var<private> terrain_fragment_uv: vec2f;

      fn terrain_sample_detail(_pixiUv: vec2f) -> vec4f {
        return sampleDetail(_pixiUv);
      }

      var<private> terrain_fragment_albedo: vec3f;

      fn terrain_material() {
        let uv = (&terrain_fragment_uv);
        terrain_fragment_albedo = (terrain_sample_detail(((*uv) * 8f)).rgb * terrain_height((*uv)));
      }"
    `);
    // GLSL needs the functions PixiJS 3D defines further down declared up front
    expect(bit.gl?.vertex?.header).toMatchInlineSnapshot(`
      "vec4 sampleHeightMapDirect(vec2 uv);

      vec4 terrain_sampleDirect_heightMap(vec2 _pixiUv) {
        return sampleHeightMapDirect(_pixiUv);
      }

      float terrain_height(vec2 uv) {
        return terrain_sampleDirect_heightMap(uv).r;
      }

      vec2 terrain_vertex_uv;

      vec3 terrain_vertex_normal;

      vec4 terrain_vertex_position;

      void terrain_beforeTransform() {
        vec3 lift = (terrain_vertex_normal * terrain_height(terrain_vertex_uv));
        terrain_vertex_position += vec4(lift, 0.0);
      }"
    `);
    expect(bit.gl?.fragment?.header).toMatchInlineSnapshot(`
      "vec4 sampleDetail(vec2 uv);
      vec4 sampleHeightMapDirect(vec2 uv);

      vec2 terrain_fragment_uv;

      vec4 terrain_sample_detail(vec2 _pixiUv) {
        return sampleDetail(_pixiUv);
      }

      vec4 terrain_sampleDirect_heightMap(vec2 _pixiUv) {
        return sampleHeightMapDirect(_pixiUv);
      }

      float terrain_height(vec2 uv) {
        return terrain_sampleDirect_heightMap(uv).r;
      }

      vec3 terrain_fragment_albedo;

      void terrain_material() {
        terrain_fragment_albedo = (terrain_sample_detail((terrain_fragment_uv * 8.0)).rgb * terrain_height(terrain_fragment_uv));
      }"
    `);
  });

  it('leaves `textures` out of a bit that samples none', () => {
    const bit = p3d.shaderBit({
      name: 'plain',
      fragment: {
        material: () => {
          'use gpu';
          p3d.fragment.alpha.$ = 1;
        },
      },
    });
    expect('textures' in bit).toBe(false);
  });

  it('rejects a mip-picking sample in a vertex slot', () => {
    const heightMap = p3d.textureSlot('heightMap');
    expect(() =>
      p3d.shaderBit({
        name: 'terrain',
        vertex: {
          beforeTransform: () => {
            'use gpu';
            p3d.vertex.position.$ += d.vec4f(0, heightMap.sample(p3d.vertex.uv.$).r, 0, 0);
          },
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:beforeTransform
      - fn*:beforeTransform()
      - fn:sample_heightMap: [@typegpu/pixi] \`heightMap.sample()\` picks a mip level from how the pixels around it are sampled, which only the fragment stage can tell, but the shader bit 'terrain' calls it in a vertex slot. Use \`heightMap.sampleDirect()\` there.]
    `);
  });

  it('rejects names PixiJS 3D could not build function names from', () => {
    expect(() => p3d.textureSlot('height-map')).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] 'height-map' can't name a texture slot. PixiJS 3D takes camelCase names, like 'heightMap'.]`,
    );
    expect(() => p3d.textureSlot('HeightMap')).toThrow();
  });

  it('only samples texture slots in shader bits', () => {
    const heightMap = p3d.textureSlot('heightMap');
    expect(() =>
      p3d.effectFragment({
        effect: (uv) => {
          'use gpu';
          return heightMap.sample(uv);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:entry
      - fn*:effect(vec2f)
      - fn:sample_heightMap: [@typegpu/pixi] \`heightMap.sample()\` reads a texture slot of a material, so it can't be called in a post effect.]
    `);
  });

  it('keeps shader values out of reach of JavaScript', () => {
    expect(() => p3d.time.$).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] \`time.$\` can only be read inside a 'use gpu' function that @typegpu/pixi turns into a shader (a filter, a shader bit or a post effect).]`,
    );
    expect(() => p3d.uniforms({ amount: d.f32 }).$.amount).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] The uniform 'amount' can only be read inside a 'use gpu' function that @typegpu/pixi turns into a shader (a filter, a shader bit or a post effect).]`,
    );
  });
});

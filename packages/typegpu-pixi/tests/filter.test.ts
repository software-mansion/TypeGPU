import { createUboElementsWGSL, Filter, type Renderer, RendererType, UniformGroup } from 'pixi.js';
import { describe, expect, vi } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import * as tp from '@typegpu/pixi';
import {
  fakeWebGLRenderer,
  fakeWebGPURenderer,
  glslOf,
  gpuBindGroupOf,
  wgslOf,
} from './utils/pixiFilter.ts';

const wobbleUniforms = tp.uniforms({ time: d.f32, strength: d.f32 });

/** The first example of the docs: the default vertex stage, and uniforms */
const wobble = {
  uniforms: wobbleUniforms,
  padding: 20,
  fragment: ({ uv }: { uv: d.v2f }) => {
    'use gpu';
    const offset = std.sin(uv.y * 40 + wobbleUniforms.$.time) * wobbleUniforms.$.strength;
    return tp.sampleInput(uv + d.vec2f(offset, 0));
  },
};

/** The second example of the docs: a vertex stage that passes its own values on */
const aberration = {
  vertex: ({ aPosition }: tp.FilterVertexIn) => {
    'use gpu';
    const uv = tp.filterTextureCoord(aPosition);
    const offset = d.vec2f(4, 0) * tp.filterGlobals.$.gfu.uInputSize.zw;
    return {
      $position: tp.filterVertexPosition(aPosition),
      uvRed: uv - offset,
      uv,
      uvBlue: uv + offset,
    };
  },
  fragment: ({ uvRed, uv, uvBlue }: { uvRed: d.v2f; uv: d.v2f; uvBlue: d.v2f }) => {
    'use gpu';
    const red = tp.sampleInput(uvRed);
    const green = tp.sampleInput(uv);
    const blue = tp.sampleInput(uvBlue);
    return d.vec4f(red.r, green.g, blue.b, std.max(red.a, green.a, blue.a));
  },
};

describe('createFilter on the WebGPU renderer', () => {
  it('generates WGSL with the default vertex stage', ({ device }) => {
    const filter = tp.createFilter(fakeWebGPURenderer(device), { name: 'wobble', ...wobble });

    expect(filter).toBeInstanceOf(Filter);
    expect(filter.glProgram).toBeUndefined();
    expect(filter.padding).toBe(20);
    expect(filter.gpuProgram.vertex?.entryPoint).toBe('filterVertex');
    expect(filter.gpuProgram.fragment?.entryPoint).toBe('fragment');
    expect(wgslOf(filter)).toMatchInlineSnapshot(`
      "struct GlobalFilterUniforms {
        uInputSize: vec4f,
        uInputPixel: vec4f,
        uInputClamp: vec4f,
        uOutputFrame: vec4f,
        uGlobalFrame: vec4f,
        uOutputTexture: vec4f,
      }

      @group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;

      fn filterVertexPosition(aPosition: vec2f) -> vec4f {
        let outputFrame = (&gfu.uOutputFrame);
        let outputTexture = (&gfu.uOutputTexture);
        let position = ((aPosition * (*outputFrame).zw) + (*outputFrame).xy);
        return vec4f(((position.x * (2f / (*outputTexture).x)) - 1f), ((position.y * ((2f * (*outputTexture).z) / (*outputTexture).y)) - (*outputTexture).z), 0f, 1f);
      }

      fn filterTextureCoord(aPosition: vec2f) -> vec2f {
        return (aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
      }

      struct filterVertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn filterVertex(@location(0) aPosition: vec2f) -> filterVertex_Output {
        return filterVertex_Output(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
      }

      struct FilterUniforms {
        time: f32,
        strength: f32,
      }

      @group(1) @binding(0) var<uniform> filterUniforms: FilterUniforms;

      @group(0) @binding(1) var uTexture: texture_2d<f32>;

      @group(0) @binding(2) var uSampler: sampler;

      fn sampleInput(uv: vec2f) -> vec4f {
        return textureSample(uTexture, uSampler, uv);
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let offset = (sin(((_arg_0.uv.y * 40f) + filterUniforms.time)) * filterUniforms.strength);
        return sampleInput((_arg_0.uv + vec2f(offset, 0f)));
      }"
    `);
  });

  it('generates WGSL with a custom vertex stage', ({ device }) => {
    const filter = tp.createFilter(fakeWebGPURenderer(device), aberration);

    expect(filter.gpuProgram.vertex?.entryPoint).toBe('vertex');
    expect(filter.gpuProgram.fragment?.entryPoint).toBe('fragment');
    expect(wgslOf(filter)).toMatchInlineSnapshot(`
      "struct GlobalFilterUniforms {
        uInputSize: vec4f,
        uInputPixel: vec4f,
        uInputClamp: vec4f,
        uOutputFrame: vec4f,
        uGlobalFrame: vec4f,
        uOutputTexture: vec4f,
      }

      @group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;

      fn filterTextureCoord(aPosition: vec2f) -> vec2f {
        return (aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
      }

      fn filterVertexPosition(aPosition: vec2f) -> vec4f {
        let outputFrame = (&gfu.uOutputFrame);
        let outputTexture = (&gfu.uOutputTexture);
        let position = ((aPosition * (*outputFrame).zw) + (*outputFrame).xy);
        return vec4f(((position.x * (2f / (*outputTexture).x)) - 1f), ((position.y * ((2f * (*outputTexture).z) / (*outputTexture).y)) - (*outputTexture).z), 0f, 1f);
      }

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uvRed: vec2f,
        @location(1) uv: vec2f,
        @location(2) uvBlue: vec2f,
      }

      struct VertexIn {
        @location(0) aPosition: vec2f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let uv = filterTextureCoord(_arg_0.aPosition);
        let offset = (vec2f(4, 0) * gfu.uInputSize.zw);
        return VertexOut(filterVertexPosition(_arg_0.aPosition), (uv - offset), uv, (uv + offset));
      }

      @group(0) @binding(1) var uTexture: texture_2d<f32>;

      @group(0) @binding(2) var uSampler: sampler;

      fn sampleInput(uv: vec2f) -> vec4f {
        return textureSample(uTexture, uSampler, uv);
      }

      struct FragmentIn {
        @location(0) uvRed: vec2f,
        @location(1) uv: vec2f,
        @location(2) uvBlue: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let red = sampleInput(_arg_0.uvRed);
        let green = sampleInput(_arg_0.uv);
        let blue = sampleInput(_arg_0.uvBlue);
        return vec4f(red.r, green.g, blue.b, max(max(red.a, green.a), blue.a));
      }"
    `);
  });

  it('types the fragment input after what the vertex stage returns', ({ device }) => {
    const options = {
      vertex: ({ aPosition }: tp.FilterVertexIn) => {
        'use gpu';
        return { $position: tp.filterVertexPosition(aPosition), shade: aPosition.x };
      },
    };

    tp.createFilter(fakeWebGPURenderer(device), {
      ...options,
      fragment: ({ shade }) => {
        'use gpu';
        return d.vec4f(shade);
      },
    });

    expect(() =>
      tp.createFilter(fakeWebGPURenderer(device), {
        ...options,
        // @ts-expect-error: the vertex stage doesn't return `uv`
        fragment: ({ uv }) => {
          'use gpu';
          return tp.sampleInput(uv);
        },
      }),
    ).toThrow();
  });

  it('puts the uniform group where PixiJS finds the uniforms', ({ device }) => {
    const filter = tp.createFilter(fakeWebGPURenderer(device), wobble);

    expect(filter.gpuProgram.structsAndGroups.groups).toContainEqual(
      expect.objectContaining({ group: 1, binding: 0, name: 'filterUniforms' }),
    );
    expect(filter.groups[1]?.resources[0]).toBeInstanceOf(UniformGroup);
    expect(filter.resources.filterUniforms).toBe(filter.groups[1]?.resources[0]);
  });

  it('finds the uniforms when TypeGPU renames them', ({ device }) => {
    // Takes the name the uniforms would have had
    const filterUniforms = (uv: d.v2f) => {
      'use gpu';
      return uv * wobbleUniforms.$.strength;
    };

    const filter = tp.createFilter(fakeWebGPURenderer(device), {
      uniforms: wobbleUniforms,
      fragment: ({ uv }) => {
        'use gpu';
        return tp.sampleInput(filterUniforms(uv));
      },
    });

    expect(wgslOf(filter)).toContain('var<uniform> filterUniforms_1: FilterUniforms;');
    expect(filter.resources.filterUniforms_1).toBeInstanceOf(UniformGroup);
  });

  it('writes uniforms to the filter', ({ device }) => {
    const filter = tp.createFilter(fakeWebGPURenderer(device), wobble);
    const group = filter.resources.filterUniforms as UniformGroup;
    const dirty = group._dirtyId;

    wobbleUniforms.write(filter, { strength: 0.5 });
    wobbleUniforms.write(filter, { time: 2 });

    expect(group.uniforms).toStrictEqual({ time: 2, strength: 0.5 });
    expect(group._dirtyId).toBeGreaterThan(dirty);
  });

  it('gives each filter its own uniform values', ({ device }) => {
    const first = tp.createFilter(fakeWebGPURenderer(device), wobble);
    const second = tp.createFilter(fakeWebGPURenderer(device), wobble);

    wobbleUniforms.write(first, { strength: 1 });

    expect((first.resources.filterUniforms as UniformGroup).uniforms.strength).toBe(1);
    expect((second.resources.filterUniforms as UniformGroup).uniforms.strength).toBe(0);
  });

  it('lays the uniforms out like PixiJS does', ({ device }) => {
    // A field of every type `uniforms()` takes, in an order that needs padding
    const allTypes = tp.uniforms({
      f: d.f32,
      v3f: d.vec3f,
      i: d.i32,
      v2i: d.vec2i,
      u: d.u32,
      v3u: d.vec3u,
      m2: d.mat2x2f,
      v2f: d.vec2f,
      m3: d.mat3x3f,
      v4i: d.vec4i,
      v3i: d.vec3i,
      v2u: d.vec2u,
      v4u: d.vec4u,
      m4: d.mat4x4f,
      v4f: d.vec4f,
    });

    const filter = tp.createFilter(fakeWebGPURenderer(device), {
      uniforms: allTypes,
      fragment: () => {
        'use gpu';
        return d.vec4f(allTypes.$.f);
      },
    });

    // PixiJS's offsets, from what its WebGPU renderer uses for a uniform group
    const pixiLayout = createUboElementsWGSL(
      Object.values((filter.resources.filterUniforms as UniformGroup).uniformStructures),
    );
    const pixiOffsets = Object.fromEntries(
      pixiLayout.uboElements.map((element) => [element.data.name, element.offset]),
    );
    // TypeGPU's offsets, as the WGSL struct lays them out
    const Struct = d.struct(allTypes.schema);
    const typegpuOffsets = Object.fromEntries(
      Object.keys(allTypes.schema).map((key) => [
        key,
        d.memoryLayoutOf(Struct, (s) => s[key as keyof typeof s]).offset,
      ]),
    );

    expect(pixiOffsets).toStrictEqual(typegpuOffsets);
    expect(pixiLayout.size).toBeGreaterThanOrEqual(d.sizeOf(Struct));
  });
});

describe('createFilter with TypeGPU resources', () => {
  it("binds them in a group next to PixiJS's own", ({ device, root }) => {
    const tint = root.createUniform(d.vec3f);
    const palette = root.createReadonly(d.arrayOf(d.vec3f, 4));
    const noise = root
      .createTexture({ size: [64, 64], format: 'rgba8unorm' })
      .$usage('sampled')
      .createView(d.texture2d(d.f32));
    const repeat = root.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat' });

    const renderer = fakeWebGPURenderer(device);
    const filter = tp.createFilter(renderer, {
      uniforms: wobbleUniforms,
      fragment: ({ uv }) => {
        'use gpu';
        const grain = std.textureSample(noise.$, repeat.$, uv * 8).r;
        const index = d.u32(grain * wobbleUniforms.$.strength);
        const color = palette.$[index] as d.v3f;
        return tp.sampleInput(uv) * d.vec4f(color * tint.$, 1);
      },
    });

    expect(wgslOf(filter)).toMatchInlineSnapshot(`
      "struct GlobalFilterUniforms {
        uInputSize: vec4f,
        uInputPixel: vec4f,
        uInputClamp: vec4f,
        uOutputFrame: vec4f,
        uGlobalFrame: vec4f,
        uOutputTexture: vec4f,
      }

      @group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;

      fn filterVertexPosition(aPosition: vec2f) -> vec4f {
        let outputFrame = (&gfu.uOutputFrame);
        let outputTexture = (&gfu.uOutputTexture);
        let position = ((aPosition * (*outputFrame).zw) + (*outputFrame).xy);
        return vec4f(((position.x * (2f / (*outputTexture).x)) - 1f), ((position.y * ((2f * (*outputTexture).z) / (*outputTexture).y)) - (*outputTexture).z), 0f, 1f);
      }

      fn filterTextureCoord(aPosition: vec2f) -> vec2f {
        return (aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
      }

      struct filterVertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn filterVertex(@location(0) aPosition: vec2f) -> filterVertex_Output {
        return filterVertex_Output(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
      }

      @group(2) @binding(0) var noise: texture_2d<f32>;

      @group(2) @binding(1) var repeat: sampler;

      struct FilterUniforms {
        time: f32,
        strength: f32,
      }

      @group(1) @binding(0) var<uniform> filterUniforms: FilterUniforms;

      @group(2) @binding(2) var<storage, read> palette: array<vec3f, 4>;

      @group(0) @binding(1) var uTexture: texture_2d<f32>;

      @group(0) @binding(2) var uSampler: sampler;

      fn sampleInput(uv: vec2f) -> vec4f {
        return textureSample(uTexture, uSampler, uv);
      }

      @group(2) @binding(3) var<uniform> tint: vec3f;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let grain = textureSample(noise, repeat, (_arg_0.uv * 8f)).r;
        let index = u32((grain * filterUniforms.strength));
        let color = (&palette[index]);
        return (sampleInput(_arg_0.uv) * vec4f(((*color) * tint), 1f));
      }"
    `);

    // The layout says what the WGSL can't: only the fragment stage reads these
    expect(filter.gpuProgram.gpuLayout[2]).toMatchInlineSnapshot(`
      [
        {
          "binding": 0,
          "texture": {
            "multisampled": false,
            "sampleType": "float",
            "viewDimension": "2d",
          },
          "visibility": 2,
        },
        {
          "binding": 1,
          "sampler": {
            "type": "non-filtering",
          },
          "visibility": 2,
        },
        {
          "binding": 2,
          "buffer": {
            "type": "read-only-storage",
          },
          "visibility": 2,
        },
        {
          "binding": 3,
          "buffer": {
            "type": "uniform",
          },
          "visibility": 2,
        },
      ]
    `);
    expect(Object.keys(filter.groups)).toStrictEqual(['0', '1', '2']);
    expect(filter.resources.filterUniforms).toBeInstanceOf(UniformGroup);

    const bindGroup = gpuBindGroupOf(renderer, filter, 2);
    expect(bindGroup).toBe(vi.mocked(device.createBindGroup).mock.results.at(-1)?.value);
    expect(vi.mocked(device.createBindGroup).mock.lastCall?.[0].entries).toHaveLength(4);
  });

  it('takes the group of the uniforms when the filter has none', ({ device, root }) => {
    const tint = root.createUniform(d.vec4f);
    const renderer = fakeWebGPURenderer(device);
    const filter = tp.createFilter(renderer, {
      // Uniforms that aren't read leave no trace in the shader
      uniforms: wobbleUniforms,
      fragment: ({ uv }) => {
        'use gpu';
        return tp.sampleInput(uv) * tint.$;
      },
    });

    expect(wgslOf(filter)).toContain('@group(1) @binding(0) var<uniform> tint: vec4f;');
    expect(Object.keys(filter.groups)).toStrictEqual(['0', '1']);
    expect(gpuBindGroupOf(renderer, filter, 1)).toBe(
      vi.mocked(device.createBindGroup).mock.results.at(-1)?.value,
    );
  });

  it('stays out of the group PixiJS fills on every draw', ({ device, root }) => {
    const tint = root.createUniform(d.vec4f);
    const corners = root.createReadonly(d.arrayOf(d.vec4f, 4));
    const filter = tp.createFilter(fakeWebGPURenderer(device), {
      uniforms: wobbleUniforms,
      vertex: ({ aPosition, $vertexIndex }) => {
        'use gpu';
        return { $position: corners.$[$vertexIndex] as d.v4f, uv: aPosition };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return tint.$ * uv.x * wobbleUniforms.$.strength;
      },
    });

    const wgsl = wgslOf(filter);
    expect(wgsl).not.toContain('@group(0)');
    expect(wgsl).toContain('@group(1) @binding(0) var<uniform> filterUniforms: FilterUniforms;');
    expect(wgsl).toContain('@group(2) @binding(0) var<storage, read> corners: array<vec4f, 4>;');
    expect(wgsl).toContain('@group(2) @binding(1) var<uniform> tint: vec4f;');
    expect(filter.gpuProgram.gpuLayout[2]).toMatchInlineSnapshot(`
      [
        {
          "binding": 0,
          "buffer": {
            "type": "read-only-storage",
          },
          "visibility": 1,
        },
        {
          "binding": 1,
          "buffer": {
            "type": "uniform",
          },
          "visibility": 2,
        },
      ]
    `);
  });

  it('gives two filters that read the same resources the same program', ({ device, root }) => {
    const tint = root.createUniform(d.vec4f);
    const options = {
      fragment: ({ uv }: { uv: d.v2f }) => {
        'use gpu';
        return tp.sampleInput(uv) * tint.$;
      },
    };
    const renderer = fakeWebGPURenderer(device);
    const first = tp.createFilter(renderer, options);
    const second = tp.createFilter(renderer, options);

    expect(second.gpuProgram).toBe(first.gpuProgram);
    expect(second.groups[1]).not.toBe(first.groups[1]);
  });
});

describe('createFilter on the WebGL renderer', () => {
  it('generates GLSL with the default vertex stage', () => {
    const filter = tp.createFilter(fakeWebGLRenderer(), { name: 'wobble-gl', ...wobble });

    expect(filter).toBeInstanceOf(Filter);
    expect(filter.gpuProgram).toBeUndefined();
    expect(filter.padding).toBe(20);

    const glsl = glslOf(filter);
    expect(glsl.vertex).toMatchInlineSnapshot(`
      "#version 300 es
      #define SHADER_NAME wobble-gl-vertex
      precision highp float;

      precision highp float;
      precision highp int;

      uniform vec4 uInputSize;
      uniform vec4 uOutputFrame;
      uniform vec4 uOutputTexture;

      vec4 filterVertexPosition(vec2 aPosition_1) {
        vec4 outputFrame = uOutputFrame;
        vec4 outputTexture = uOutputTexture;
        vec2 position = ((aPosition_1 * outputFrame.zw) + outputFrame.xy);
        return vec4(((position.x * (2.0 / outputTexture.x)) - 1.0), ((position.y * ((2.0 * outputTexture.z) / outputTexture.y)) - outputTexture.z), 0.0, 1.0);
      }

      vec2 filterTextureCoord(vec2 aPosition_1) {
        return (aPosition_1 * (uOutputFrame.zw * uInputSize.zw));
      }

      out vec2 vary_uv;

      layout(location=0) in vec2 aPosition;

      void main() {
        vec2 aPosition_1 = aPosition;
        {
          gl_Position = filterVertexPosition(aPosition_1);
          vary_uv = filterTextureCoord(aPosition_1);
          return;
        }
      }
      "
    `);
    expect(glsl.fragment).toMatchInlineSnapshot(`
      "#version 300 es
      #define SHADER_NAME wobble-gl-fragment
      precision lowp sampler2D;
      precision mediump float;

      precision highp float;
      precision highp int;

      uniform float time;
      uniform float strength;
      uniform sampler2D uTexture;

      vec4 sampleInput(vec2 uv) {
        return texture(uTexture, uv);
      }

      layout(location=0) out vec4 _fragColor;

      struct FragmentIn {
        vec2 uv;
      };

      in vec2 vary_uv;

      void main() {
        FragmentIn _arg_0 = FragmentIn(vary_uv);
        float offset = (sin(((_arg_0.uv.y * 40.0) + time)) * strength);
        _fragColor = sampleInput((_arg_0.uv + vec2(offset, 0.0)));
      }
      "
    `);
  });

  it('generates GLSL with a custom vertex stage', () => {
    const filter = tp.createFilter(fakeWebGLRenderer(), { name: 'aberration-gl', ...aberration });

    const glsl = glslOf(filter);
    expect(glsl.vertex).toMatchInlineSnapshot(`
      "#version 300 es
      #define SHADER_NAME aberration-gl-vertex
      precision highp float;

      precision highp float;
      precision highp int;

      uniform vec4 uInputSize;
      uniform vec4 uOutputFrame;
      uniform vec4 uOutputTexture;

      vec2 filterTextureCoord(vec2 aPosition_1) {
        return (aPosition_1 * (uOutputFrame.zw * uInputSize.zw));
      }

      vec4 filterVertexPosition(vec2 aPosition_1) {
        vec4 outputFrame = uOutputFrame;
        vec4 outputTexture = uOutputTexture;
        vec2 position = ((aPosition_1 * outputFrame.zw) + outputFrame.xy);
        return vec4(((position.x * (2.0 / outputTexture.x)) - 1.0), ((position.y * ((2.0 * outputTexture.z) / outputTexture.y)) - outputTexture.z), 0.0, 1.0);
      }

      out vec2 vary_uvRed;

      out vec2 vary_uv;

      out vec2 vary_uvBlue;

      struct VertexIn {
        vec2 aPosition;
      };

      layout(location=0) in vec2 aPosition;

      void main() {
        VertexIn _arg_0 = VertexIn(aPosition);
        vec2 uv = filterTextureCoord(_arg_0.aPosition);
        vec2 offset = (vec2(4, 0) * uInputSize.zw);
        {
          gl_Position = filterVertexPosition(_arg_0.aPosition);
          vary_uvRed = (uv - offset);
          vary_uv = uv;
          vary_uvBlue = (uv + offset);
          return;
        }
      }
      "
    `);
    expect(glsl.fragment).toMatchInlineSnapshot(`
      "#version 300 es
      #define SHADER_NAME aberration-gl-fragment
      precision lowp sampler2D;
      precision mediump float;

      precision highp float;
      precision highp int;

      uniform sampler2D uTexture;

      vec4 sampleInput(vec2 uv) {
        return texture(uTexture, uv);
      }

      layout(location=0) out vec4 _fragColor;

      struct FragmentIn {
        vec2 uvRed;
        vec2 uv;
        vec2 uvBlue;
      };

      in vec2 vary_uvRed;

      in vec2 vary_uv;

      in vec2 vary_uvBlue;

      void main() {
        FragmentIn _arg_0 = FragmentIn(vary_uvRed, vary_uv, vary_uvBlue);
        vec4 red = sampleInput(_arg_0.uvRed);
        vec4 green = sampleInput(_arg_0.uv);
        vec4 blue = sampleInput(_arg_0.uvBlue);
        _fragColor = vec4(red.r, green.g, blue.b, max(max(red.a, green.a), blue.a));
      }
      "
    `);
  });

  it('keeps the global uniforms whole when a shader holds on to them', () => {
    const filter = tp.createFilter(fakeWebGLRenderer(), {
      name: 'whole-globals-gl',
      fragment: ({ uv }) => {
        'use gpu';
        const globals = tp.filterGlobals.$.gfu;
        return tp.sampleInput(uv + globals.uInputSize.zw);
      },
    });

    const { fragment } = glslOf(filter);
    expect(fragment).toContain('struct GlobalFilterUniforms {');
    expect(fragment).toContain(
      'GlobalFilterUniforms globals = GlobalFilterUniforms(uInputSize, uInputPixel, uInputClamp, uOutputFrame, uGlobalFrame, uOutputTexture);',
    );
  });

  it('leaves out of each stage what only the other stage calls', () => {
    // `fwidth` and `discard` only exist in fragment shaders
    const edge = (uv: d.v2f) => {
      'use gpu';
      const width = std.fwidth(uv.x);
      if (width > 100) {
        std.discard();
      }
      return width;
    };

    const filter = tp.createFilter(fakeWebGLRenderer(), {
      name: 'stages-gl',
      fragment: ({ uv }) => {
        'use gpu';
        return tp.sampleInput(uv) * edge(uv);
      },
    });

    const glsl = glslOf(filter);
    expect(glsl.vertex).not.toContain('fwidth');
    expect(glsl.vertex).not.toContain('uTexture');
    expect(glsl.fragment).toContain('float width = fwidth(uv.x);');
    expect(glsl.fragment).not.toContain('filterVertexPosition');
  });

  it("keeps TypeGPU's names away from PixiJS's", () => {
    const time = (x: number) => {
      'use gpu';
      return x * 2;
    };

    const filter = tp.createFilter(fakeWebGLRenderer(), {
      name: 'names-gl',
      uniforms: wobbleUniforms,
      fragment: ({ uv }) => {
        'use gpu';
        const strength = d.f32(3);
        const uTexture = time(wobbleUniforms.$.time) + wobbleUniforms.$.strength * strength;
        return tp.sampleInput(uv * uTexture);
      },
    });

    expect(glslOf(filter).fragment).toContain(
      'float uTexture_1 = (time_1(time) + (strength * strength_1));',
    );
  });

  it('writes uniforms to the filter', () => {
    const filter = tp.createFilter(fakeWebGLRenderer(), wobble);
    const group = filter.resources.filterUniforms as UniformGroup;

    wobbleUniforms.write(filter, { strength: 0.5, time: 2 });

    // PixiJS's WebGL renderer sets each value as the uniform with its name
    expect(group.uniforms).toStrictEqual({ time: 2, strength: 0.5 });
  });

  it("rejects uniforms named like PixiJS's own", () => {
    const clashing = tp.uniforms({ uInputSize: d.vec4f });
    expect(() =>
      tp.createFilter(fakeWebGLRenderer(), {
        uniforms: clashing,
        fragment: () => {
          'use gpu';
          return clashing.$.uInputSize;
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] PixiJS's WebGL renderer sets each uniform of a filter under its own name, and 'uInputSize' is already taken by PixiJS. Rename the uniform.]`,
    );
  });

  it('rejects uniforms named with a GLSL keyword', () => {
    const keywords = tp.uniforms({ input: d.f32, sample: d.f32 });
    expect(() =>
      tp.createFilter(fakeWebGLRenderer(), {
        uniforms: keywords,
        fragment: () => {
          'use gpu';
          return d.vec4f(keywords.$.input + keywords.$.sample);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] PixiJS's WebGL renderer sets each uniform of a filter under its own name, but 'input', 'sample' can't be a name in GLSL. Rename the uniform.]`,
    );
  });
});

describe('createFilter errors', () => {
  it('rejects uniforms that were not passed', ({ device }) => {
    for (const renderer of [fakeWebGPURenderer(device), fakeWebGLRenderer()]) {
      expect(() =>
        tp.createFilter(renderer, {
          name: 'Wobble',
          fragment: ({ uv }) => {
            'use gpu';
            return tp.sampleInput(uv * wobbleUniforms.$.strength);
          },
        }),
      ).toThrow(
        "[@typegpu/pixi] The filter 'Wobble' reads the uniform 'strength', which isn't one of its own. Pass the uniforms it reads to `createFilter` as `uniforms`.",
      );
    }
  });

  it('rejects uniforms other than its own', ({ device }) => {
    const otherUniforms = tp.uniforms({ strength: d.f32 });
    expect(() =>
      tp.createFilter(fakeWebGPURenderer(device), {
        uniforms: otherUniforms,
        fragment: ({ uv }) => {
          'use gpu';
          return tp.sampleInput(uv * wobbleUniforms.$.strength);
        },
      }),
    ).toThrow("[@typegpu/pixi] A filter reads the uniform 'strength', which isn't one of its own.");
  });

  it('rejects TypeGPU resources on the WebGL renderer', ({ root }) => {
    const scale = root.createUniform(d.f32);
    const tint = root.createUniform(d.vec4f);
    expect(() =>
      tp.createFilter(fakeWebGLRenderer(), {
        fragment: () => {
          'use gpu';
          return tint.$;
        },
      }),
    ).toThrow("which only exist on PixiJS's WebGPU renderer");
    expect(() =>
      tp.createFilter(fakeWebGLRenderer(), {
        fragment: ({ uv }) => {
          'use gpu';
          return tp.sampleInput(uv * scale.$);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] A filter reads a TypeGPU buffer, texture or sampler, which only exist on PixiJS's WebGPU renderer. For the WebGL renderer, pass values through \`uniforms\` instead.]`,
    );
  });

  it('rejects bind group layouts, which it has no bind group for', ({ device }) => {
    const layout = tgpu.bindGroupLayout({ scale: { uniform: d.f32 } });
    expect(() =>
      tp.createFilter(fakeWebGPURenderer(device), {
        fragment: ({ uv }) => {
          'use gpu';
          return tp.sampleInput(uv * layout.$.scale);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] A filter reads a TypeGPU bind group layout, and a filter has no bind group to fill it with. Read buffers, textures and samplers directly instead, like \`buffer.$\`.]`,
    );
  });

  it('rejects renderers other than WebGPU and WebGL', () => {
    const canvasRenderer = { type: RendererType.CANVAS } as unknown as Renderer;
    expect(() => tp.createFilter(canvasRenderer, wobble)).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] Filters made by \`createFilter\` need PixiJS's WebGPU or WebGL renderer, but PixiJS started with a different one.]`,
    );
  });

  it('only gives filter values inside a filter', () => {
    expect(() => tp.filterGlobals.$).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@typegpu/pixi] \`filterGlobals.$\` can only be read inside a 'use gpu' function that @typegpu/pixi turns into a shader (a filter, a shader bit or a post effect).]`,
    );
    expect(() => tp.sampleInput(d.vec2f())).toThrow();
  });
});

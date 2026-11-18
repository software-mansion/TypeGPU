import type { Filter } from 'pixi.js';
import { expect } from 'vitest';
import { d, std } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import * as tp from '@typegpu/pixi';
import { fakeWebGPURenderer } from './utils/pixiFilter.ts';

// These compile the WGSL of filters on a real device, and build the render pipeline
// PixiJS would build from it. The GLSL is checked by `filter.test.ts` as far as that
// goes without a WebGL context.

async function pipelineErrors(device: GPUDevice, filter: Filter): Promise<string[]> {
  const program = filter.gpuProgram;
  const code = program.vertex?.source ?? '';

  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();

  // What PixiJS's filter system draws with: one quad corner per vertex, as a vec2f
  device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: program.vertex?.entryPoint as string,
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: program.fragment?.entryPoint as string,
      targets: [{ format: 'rgba8unorm' }],
    },
  });
  const error = await device.popErrorScope();

  const errors = info.messages
    .filter((message) => message.type === 'error')
    .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
  return error ? [...errors, error.message] : errors;
}

const allTypes = tp.uniforms({
  f: d.f32,
  i: d.i32,
  u: d.u32,
  v2f: d.vec2f,
  v3f: d.vec3f,
  v4f: d.vec4f,
  v2i: d.vec2i,
  v3i: d.vec3i,
  v4i: d.vec4i,
  v2u: d.vec2u,
  v3u: d.vec3u,
  v4u: d.vec4u,
  m2: d.mat2x2f,
  m3: d.mat3x3f,
  m4: d.mat4x4f,
});

const edge = (uv: d.v2f) => {
  'use gpu';
  const width = std.fwidth(uv.x);
  if (width > 100) {
    std.discard();
  }
  return std.dpdx(uv.y) + width;
};

gpuIt('a filter with the default vertex stage compiles', async ({ gpu }) => {
  const filter = tp.createFilter(fakeWebGPURenderer(gpu.device), {
    uniforms: allTypes,
    fragment: ({ uv, $position }) => {
      'use gpu';
      const a = allTypes.$.m2 * allTypes.$.v2f;
      const b = allTypes.$.m3 * allTypes.$.v3f;
      const c = allTypes.$.m4 * allTypes.$.v4f;
      const ints = d.vec4f(allTypes.$.v4i) + d.vec4f(d.vec3f(allTypes.$.v3i), d.f32(allTypes.$.i));
      const uints = d.vec4f(allTypes.$.v4u) + d.vec4f(d.vec3f(allTypes.$.v3u), d.f32(allTypes.$.u));
      const more = d.vec4f(d.vec2f(allTypes.$.v2u), d.vec2f(allTypes.$.v2i));
      const pixel = $position.xy / tp.filterGlobals.$.gfu.uGlobalFrame.zw;
      return (
        tp.sampleInput(uv) * allTypes.$.f * edge(uv) +
        d.vec4f(a, b.xy + pixel) +
        c +
        ints +
        uints +
        more
      );
    },
  });

  expect(await pipelineErrors(gpu.device, filter)).toStrictEqual([]);
});

gpuIt('a filter with a custom vertex stage compiles', async ({ gpu }) => {
  const filter = tp.createFilter(fakeWebGPURenderer(gpu.device), {
    vertex: ({ aPosition }) => {
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
    fragment: ({ uvRed, uv, uvBlue }) => {
      'use gpu';
      const red = tp.sampleInput(uvRed);
      const green = tp.sampleInput(uv);
      const blue = tp.sampleInput(uvBlue);
      return d.vec4f(red.r, green.g, blue.b, std.max(red.a, green.a, blue.a));
    },
  });

  expect(await pipelineErrors(gpu.device, filter)).toStrictEqual([]);
});

gpuIt('a filter that keeps the global uniforms whole compiles', async ({ gpu }) => {
  const filter = tp.createFilter(fakeWebGPURenderer(gpu.device), {
    fragment: ({ uv }) => {
      'use gpu';
      const globals = tp.filterGlobals.$.gfu;
      const clamped = std.clamp(uv, globals.uInputClamp.xy, globals.uInputClamp.zw);
      return tp.sampleInput(clamped + globals.uInputPixel.zw);
    },
  });

  expect(await pipelineErrors(gpu.device, filter)).toStrictEqual([]);
});

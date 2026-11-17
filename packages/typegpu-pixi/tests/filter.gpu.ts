import type { Filter, Renderer } from 'pixi.js';
import { expect } from 'vitest';
import { d, std } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import * as tp from '@typegpu/pixi';
import { fakeWebGPURenderer, gpuBindGroupOf } from './utils/pixiFilter.ts';

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

/**
 * Draws a filter over a 4 by 4 target the way PixiJS's filter system does: with the pipeline
 * layout PixiJS creates from the program, PixiJS's bind group at index 0, and the filter's
 * own after it.
 * @returns The validation errors, and the colour of the target's first pixel
 */
async function drawFilter(
  device: GPUDevice,
  renderer: Renderer,
  filter: Filter,
  uniformData?: Float32Array<ArrayBuffer>,
) {
  const program = filter.gpuProgram;
  const size = 4;

  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: program.vertex?.source ?? '' });
  const layouts = program.gpuLayout.map((entries) => device.createBindGroupLayout({ entries }));
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
    vertex: {
      module,
      entryPoint: program.vertex?.entryPoint as string,
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
      ],
    },
    fragment: {
      module,
      entryPoint: program.fragment?.entryPoint as string,
      targets: [{ format: 'rgba8unorm' }],
    },
  });

  const writeBuffer = (data: Float32Array<ArrayBuffer>, usage: number) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };

  // A white input, as big as the output
  const input = device.createTexture({
    size: [size, size],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: input },
    new Uint8Array(size * size * 4).fill(255),
    { bytesPerRow: size * 4 },
    [size, size],
  );
  // prettier-ignore
  const globals = new Float32Array([
    size, size, 1 / size, 1 / size, // uInputSize
    size, size, 1 / size, 1 / size, // uInputPixel
    0, 0, 1, 1,                     // uInputClamp
    0, 0, size, size,               // uOutputFrame
    0, 0, size, size,               // uGlobalFrame
    size, size, 1, 0,               // uOutputTexture
  ]);
  const bindGroups: GPUBindGroup[] = [
    device.createBindGroup({
      layout: layouts[0] as GPUBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: writeBuffer(globals, GPUBufferUsage.UNIFORM) } },
        { binding: 1, resource: input.createView() },
        { binding: 2, resource: device.createSampler() },
      ],
    }),
  ];
  for (let index = 1; index < layouts.length; index++) {
    bindGroups[index] =
      uniformData && index === 1
        ? device.createBindGroup({
            layout: layouts[index] as GPUBindGroupLayout,
            entries: [
              {
                binding: 0,
                resource: { buffer: writeBuffer(uniformData, GPUBufferUsage.UNIFORM) },
              },
            ],
          })
        : gpuBindGroupOf(renderer, filter, index);
  }

  const target = device.createTexture({
    size: [size, size],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const quad = writeBuffer(
    new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    GPUBufferUsage.VERTEX,
  );

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store' }],
  });
  pass.setPipeline(pipeline);
  bindGroups.forEach((bindGroup, index) => pass.setBindGroup(index, bindGroup));
  pass.setVertexBuffer(0, quad);
  pass.draw(6);
  pass.end();

  const readback = device.createBuffer({
    size: 256 * size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 256 }, [
    size,
    size,
  ]);
  device.queue.submit([encoder.finish()]);
  const error = await device.popErrorScope();

  await readback.mapAsync(GPUMapMode.READ);
  const pixel = [...new Uint8Array(readback.getMappedRange(0, 4))];
  readback.unmap();

  return { errors: error ? [error.message] : [], pixel };
}

const mixUniforms = tp.uniforms({ amount: d.f32 });

gpuIt('a filter draws with TypeGPU buffers, a texture and a sampler', async ({ gpu }) => {
  const renderer = fakeWebGPURenderer(gpu.device);
  const root = tp.getRoot(renderer);

  const tint = root.createUniform(d.vec3f, d.vec3f(1, 0.5, 0));
  const palette = root.createReadonly(d.arrayOf(d.vec3f, 2), [d.vec3f(0), d.vec3f(0, 0, 1)]);
  const texture = root.createTexture({ size: [1, 1], format: 'rgba8unorm' }).$usage('sampled');
  texture.write(new Uint8Array([255, 255, 255, 51]));
  const view = texture.createView(d.texture2d(d.f32));
  const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const filter = tp.createFilter(renderer, {
    uniforms: mixUniforms,
    fragment: ({ uv }) => {
      'use gpu';
      const texel = std.textureSample(view.$, sampler.$, uv);
      const color = std.mix(tint.$, palette.$[1] as d.v3f, mixUniforms.$.amount);
      return tp.sampleInput(uv) * d.vec4f(color, texel.a);
    },
  });

  // The buffer is read when the filter draws, so a write after creating the filter shows
  tint.write(d.vec3f(1, 1, 0));

  const { errors, pixel } = await drawFilter(
    gpu.device,
    renderer,
    filter,
    new Float32Array([0.2, 0, 0, 0]),
  );
  expect(errors).toStrictEqual([]);
  expect(pixel).toStrictEqual([204, 204, 51, 51]);
});

gpuIt('a filter draws with resources read in each stage', async ({ gpu }) => {
  const renderer = fakeWebGPURenderer(gpu.device);
  const root = tp.getRoot(renderer);

  const vertexTint = root.createReadonly(d.arrayOf(d.vec3f, 1), [d.vec3f(0.2, 0.4, 0.6)]);
  // Only the fragment stage reads it, which is the one stage that may write to a buffer
  const counter = root.createMutable(d.vec4f, d.vec4f(0, 0, 0, 0.8));

  const filter = tp.createFilter(renderer, {
    vertex: ({ aPosition }) => {
      'use gpu';
      return {
        $position: tp.filterVertexPosition(aPosition),
        uv: tp.filterTextureCoord(aPosition),
        tint: vertexTint.$[0] as d.v3f,
      };
    },
    fragment: ({ uv, tint }) => {
      'use gpu';
      return tp.sampleInput(uv) * d.vec4f(tint, counter.$.a);
    },
  });

  const { errors, pixel } = await drawFilter(gpu.device, renderer, filter);
  expect(errors).toStrictEqual([]);
  expect(pixel).toStrictEqual([51, 102, 153, 204]);
});

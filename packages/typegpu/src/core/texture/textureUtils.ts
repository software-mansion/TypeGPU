import {
  getDeviceTextureFormatInfo,
  textureFormats,
} from './textureFormats.ts';
import type { ExternalImageSource } from './texture.ts';

export function getImageSourceDimensions(
  source: ExternalImageSource,
): { width: number; height: number } {
  if ('displayWidth' in source && 'displayHeight' in source) {
    return { width: source.displayWidth, height: source.displayHeight };
  }
  return { width: source.width as number, height: source.height as number };
}

type CachedResources = {
  vertexShader: GPUShaderModule;
  fragmentShader: GPUShaderModule;
  bindGroupLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  sampler: GPUSampler;
};

const deviceResourceCache = new WeakMap<
  GPUDevice,
  Map<string, CachedResources>
>();

function getDeviceCache(device: GPUDevice): Map<string, CachedResources> {
  let cache = deviceResourceCache.get(device);
  if (!cache) {
    cache = new Map<string, CachedResources>();
    deviceResourceCache.set(device, cache);
  }
  return cache;
}

export function clearTextureUtilsCache(device: GPUDevice): void {
  const cache = deviceResourceCache.get(device);
  if (cache) {
    cache.clear();
  }
}

export function generateTextureMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  baseMipLevel = 0,
  mipLevels?: number,
) {
  if (texture.dimension !== '2d') {
    throw new Error(
      'Cannot generate mipmaps for non-2D textures: only 2D textures are currently supported.',
    );
  }

  const actualMipLevels = mipLevels ?? (texture.mipLevelCount - baseMipLevel);
  const formatInfo = getDeviceTextureFormatInfo(texture.format, device);

  const hasFloatSampleType = [...formatInfo.sampleTypes].some((type) =>
    type === 'float' || type === 'unfilterable-float'
  );

  if (!hasFloatSampleType) {
    throw new Error(
      `Cannot generate mipmaps for format '${texture.format}': only float and unfilterable-float formats are currently supported.`,
    );
  }

  if (!formatInfo.canRenderAttachment) {
    throw new Error(
      `Cannot generate mipmaps for format '${texture.format}': format does not support render attachments.`,
    );
  }

  // Generate mipmaps for all layers
  for (let layer = 0; layer < texture.depthOrArrayLayers; layer++) {
    for (
      let mip = baseMipLevel;
      mip < baseMipLevel + actualMipLevels - 1;
      mip++
    ) {
      const srcMipLevel = mip;
      const dstMipLevel = mip + 1;

      generateMipmapLevel(device, texture, srcMipLevel, dstMipLevel, layer);
    }
  }
}

export function resampleImage(
  device: GPUDevice,
  targetTexture: GPUTexture,
  image: ExternalImageSource,
  layer?: number,
) {
  if (targetTexture.dimension === '3d') {
    throw new Error(
      'Cannot resample to 3D textures: only 2D textures are currently supported.',
    );
  }

  const formatInfo = textureFormats[targetTexture.format];

  const hasFloatSampleType = [...formatInfo.sampleTypes].some((type) =>
    type === 'float' || type === 'unfilterable-float'
  );

  if (!hasFloatSampleType) {
    throw new Error(
      `Cannot resample to format '${targetTexture.format}': only float and unfilterable-float formats are currently supported.`,
    );
  }

  if (!formatInfo.canRenderAttachment) {
    throw new Error(
      `Cannot resample to format '${targetTexture.format}': format does not support render attachments.`,
    );
  }

  return resampleWithRenderPipeline(device, targetTexture, image, layer);
}

function resampleWithRenderPipeline(
  device: GPUDevice,
  targetTexture: GPUTexture,
  image: ExternalImageSource,
  layer = 0,
) {
  const formatInfo = textureFormats[targetTexture.format];
  const canFilter = [...formatInfo.sampleTypes].includes('float');

  const cacheKey = `${canFilter ? 'filterable' : 'unfilterable'}`;

  const deviceCache = getDeviceCache(device);
  let cached = deviceCache.get(cacheKey);
  if (!cached) {
    const vertexShader = device.createShaderModule({
      code: `
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  let uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

  var output: VertexOutput;
  output.pos = vec4f(pos[vertexIndex], 0, 1);
  output.uv = uv[vertexIndex];
  return output;
}
      `,
    });

    const sampler = device.createSampler({
      magFilter: canFilter ? 'linear' : 'nearest',
      minFilter: canFilter ? 'linear' : 'nearest',
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: canFilter ? 'filtering' : 'non-filtering',
          },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const fragmentShader = device.createShaderModule({
      code: `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  ${
        canFilter
          ? 'return textureSample(inputTexture, inputSampler, uv);'
          : `let texelCoord = vec2u(uv * vec2f(textureDimensions(inputTexture)));
        return textureLoad(inputTexture, texelCoord, 0);`
      }
}
      `,
    });

    cached = {
      vertexShader,
      fragmentShader,
      bindGroupLayout,
      pipelineLayout,
      sampler,
    };
    deviceCache.set(cacheKey, cached);
  }

  const inputTexture = device.createTexture({
    size: [...Object.values(getImageSourceDimensions(image))],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_DST,
  });

  const { width, height } = getImageSourceDimensions(image);
  device.queue.copyExternalImageToTexture(
    { source: image },
    { texture: inputTexture },
    [width, height, 1],
  );

  const renderTexture = device.createTexture({
    size: [targetTexture.width, targetTexture.height, 1],
    format: targetTexture.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const pipeline = device.createRenderPipeline({
    layout: cached.pipelineLayout,
    vertex: {
      module: cached.vertexShader,
    },
    fragment: {
      module: cached.fragmentShader,
      targets: [
        {
          format: targetTexture.format,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const bindGroup = device.createBindGroup({
    layout: cached.bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: inputTexture.createView(),
      },
      {
        binding: 1,
        resource: cached.sampler,
      },
    ],
  });

  const encoder = device.createCommandEncoder();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: renderTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.draw(3);
  renderPass.end();

  encoder.copyTextureToTexture(
    { texture: renderTexture },
    {
      texture: targetTexture,
      origin: { x: 0, y: 0, z: layer },
    },
    {
      width: targetTexture.width,
      height: targetTexture.height,
      depthOrArrayLayers: 1,
    },
  );

  device.queue.submit([encoder.finish()]);

  inputTexture.destroy();
  renderTexture.destroy();
}

function generateMipmapLevel(
  device: GPUDevice,
  texture: GPUTexture,
  srcMipLevel: number,
  dstMipLevel: number,
  layer?: number,
) {
  const formatInfo = getDeviceTextureFormatInfo(texture.format, device);
  const canFilter = [...formatInfo.sampleTypes].includes('float');

  const cacheKey = `${canFilter ? 'filterable' : 'unfilterable'}`;

  const deviceCache = getDeviceCache(device);
  let cached = deviceCache.get(cacheKey);
  if (!cached) {
    const vertexShader = device.createShaderModule({
      code: `
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  let uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

  var output: VertexOutput;
  output.pos = vec4f(pos[vertexIndex], 0, 1);
  output.uv = uv[vertexIndex];
  return output;
}
      `,
    });

    const fragmentShader = device.createShaderModule({
      code: `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(inputTexture, inputSampler, uv);
}
      `,
    });

    const sampler = device.createSampler({
      magFilter: canFilter ? 'linear' : 'nearest',
      minFilter: canFilter ? 'linear' : 'nearest',
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: canFilter ? 'float' : 'unfilterable-float',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: canFilter ? 'filtering' : 'non-filtering',
          },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    cached = {
      vertexShader,
      fragmentShader,
      bindGroupLayout,
      pipelineLayout,
      sampler,
    };
    deviceCache.set(cacheKey, cached);
  }

  const pipeline = device.createRenderPipeline({
    layout: cached.pipelineLayout,
    vertex: {
      module: cached.vertexShader,
    },
    fragment: {
      module: cached.fragmentShader,
      targets: [
        {
          format: texture.format,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const srcTextureView = texture.createView({
    baseMipLevel: srcMipLevel,
    dimension: '2d',
    mipLevelCount: 1,
    ...(layer !== undefined && {
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    }),
  });

  const dstTextureView = texture.createView({
    baseMipLevel: dstMipLevel,
    dimension: '2d',
    mipLevelCount: 1,
    ...(layer !== undefined && {
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    }),
  });

  const bindGroup = device.createBindGroup({
    layout: cached.bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: srcTextureView,
      },
      {
        binding: 1,
        resource: cached.sampler,
      },
    ],
  });

  const encoder = device.createCommandEncoder();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: dstTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.draw(3);
  renderPass.end();

  device.queue.submit([encoder.finish()]);
}

import { getEffectiveSampleTypes, getTextureFormatInfo } from './textureFormats.ts';
import type {
  TextureChannel,
  TextureChannelWriteLayout,
  TextureImageWriteLayout,
} from './textureWrite.ts';

const FULLSCREEN_VERTEX_SHADER = `
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
  const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
  return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
}`;

const SAMPLE_FRAGMENT_SHADER = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(src, samp, uv);
}`;

const GATHER_FRAGMENT_SHADER = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let r = textureGather(0, src, samp, uv);
  let g = textureGather(1, src, samp, uv);
  let b = textureGather(2, src, samp, uv);
  let a = textureGather(3, src, samp, uv);
  return vec4f(dot(r, vec4f(0.25)), dot(g, vec4f(0.25)), dot(b, vec4f(0.25)), dot(a, vec4f(0.25)));
}`;

const CHANNEL_FRAGMENT_SHADER = (channel: TextureChannel) => `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let value = textureSample(src, samp, uv).${channel};
  return vec4f(value);
}`;

type BlitResources = {
  vertexModule: GPUShaderModule;
  fragmentModule: GPUShaderModule;
  bindGroupLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  sampler: GPUSampler;
};

type DeviceCache = {
  vertexModule: GPUShaderModule;
  filterableResources: Map<string, { fragmentModule: GPUShaderModule; sampler: GPUSampler }>;
  channelModules: Map<TextureChannel, GPUShaderModule>;
  stagedTexture?: { key: string; texture: GPUTexture };
  layoutResources: Map<
    string,
    { bindGroupLayout: GPUBindGroupLayout; pipelineLayout: GPUPipelineLayout }
  >;
};

const blitCache = new WeakMap<GPUDevice, DeviceCache>();

function getOrCreateDeviceCache(device: GPUDevice): DeviceCache {
  let cache = blitCache.get(device);
  if (!cache) {
    cache = {
      vertexModule: device.createShaderModule({
        code: FULLSCREEN_VERTEX_SHADER,
      }),
      filterableResources: new Map(),
      channelModules: new Map(),
      layoutResources: new Map(),
    };
    blitCache.set(device, cache);
  }
  return cache;
}

function getChannelShaderModule(device: GPUDevice, channel: TextureChannel): GPUShaderModule {
  const cache = getOrCreateDeviceCache(device);
  let module = cache.channelModules.get(channel);
  if (!module) {
    module = device.createShaderModule({
      code: CHANNEL_FRAGMENT_SHADER(channel),
    });
    cache.channelModules.set(channel, module);
  }
  return module;
}

function channelWriteMask(channel: TextureChannel): GPUColorWriteFlags {
  switch (channel) {
    case 'r':
      return GPUColorWrite.RED;
    case 'g':
      return GPUColorWrite.GREEN;
    case 'b':
      return GPUColorWrite.BLUE;
    case 'a':
      return GPUColorWrite.ALPHA;
  }
}

function getBlitResources(
  device: GPUDevice,
  filterable: boolean,
  sampleType: GPUTextureSampleType,
  filter: GPUFilterMode = 'linear',
): BlitResources {
  const cache = getOrCreateDeviceCache(device);

  const filterableKey = `${filterable}:${filter}`;
  let filterableRes = cache.filterableResources.get(filterableKey);
  if (!filterableRes) {
    filterableRes = {
      fragmentModule: device.createShaderModule({
        code: filterable ? SAMPLE_FRAGMENT_SHADER : GATHER_FRAGMENT_SHADER,
      }),
      sampler: device.createSampler(filterable ? { magFilter: filter, minFilter: filter } : {}),
    };
    cache.filterableResources.set(filterableKey, filterableRes);
  }

  const layoutKey = `${filterable}:${sampleType}`;
  let layoutRes = cache.layoutResources.get(layoutKey);
  if (!layoutRes) {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: filterable ? 'filtering' : 'non-filtering' },
        },
      ],
    });
    layoutRes = {
      bindGroupLayout,
      pipelineLayout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
    };
    cache.layoutResources.set(layoutKey, layoutRes);
  }

  return {
    vertexModule: cache.vertexModule,
    ...filterableRes,
    ...layoutRes,
  };
}

type BlitOptions = {
  device: GPUDevice;
  source: GPUTextureView;
  destination: GPUTextureView;
  format: GPUTextureFormat;
  filterable: boolean;
  sampleType: GPUTextureSampleType;
  filter?: GPUFilterMode;
  encoder?: GPUCommandEncoder;
  loadOp?: GPULoadOp;
  viewport?: { x: number; y: number; width: number; height: number };
};

function blit(options: BlitOptions): void {
  const { device, source, destination, format, filterable, sampleType } = options;
  const resources = getBlitResources(device, filterable, sampleType, options.filter);

  const pipeline = device.createRenderPipeline({
    layout: resources.pipelineLayout,
    vertex: { module: resources.vertexModule },
    fragment: { module: resources.fragmentModule, targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: resources.bindGroupLayout,
    entries: [
      { binding: 0, resource: source },
      { binding: 1, resource: resources.sampler },
    ],
  });

  const ownEncoder = !options.encoder;
  const encoder = options.encoder ?? device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: destination,
        loadOp: options.loadOp ?? 'clear',
        storeOp: 'store',
      },
    ],
  });
  if (options.viewport) {
    pass.setViewport(
      options.viewport.x,
      options.viewport.y,
      options.viewport.width,
      options.viewport.height,
      0,
      1,
    );
    pass.setScissorRect(
      options.viewport.x,
      options.viewport.y,
      options.viewport.width,
      options.viewport.height,
    );
  }
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();

  if (ownEncoder) {
    device.queue.submit([encoder.finish()]);
  }
}

function imageStagingFormat(format: GPUTextureFormat): GPUTextureFormat {
  if (format === 'rgba8unorm-srgb' || format === 'bgra8unorm-srgb') {
    return format;
  }

  return 'rgba8unorm';
}

function getStagedImageTexture(
  device: GPUDevice,
  write: TextureImageWriteLayout,
  targetFormat: GPUTextureFormat,
): GPUTexture {
  const cache = getOrCreateDeviceCache(device);
  const format = imageStagingFormat(targetFormat);
  const key = `${format}:${write.sourceSize.width}x${write.sourceSize.height}`;
  let inputTexture = cache.stagedTexture?.key === key ? cache.stagedTexture.texture : undefined;

  if (!inputTexture) {
    cache.stagedTexture?.texture.destroy();
    inputTexture = device.createTexture({
      size: write.sourceSize,
      format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    cache.stagedTexture = { key, texture: inputTexture };
  }

  device.queue.copyExternalImageToTexture(
    {
      source: write.source,
      ...((write.sourceOrigin.x !== 0 || write.sourceOrigin.y !== 0) && {
        origin: write.sourceOrigin,
      }),
      ...(write.flipY !== undefined && { flipY: write.flipY }),
    },
    { texture: inputTexture },
    write.sourceSize,
  );

  return inputTexture;
}

export function clearTextureUtilsCache(device: GPUDevice): void {
  const cache = blitCache.get(device);
  if (cache) {
    cache.stagedTexture?.texture.destroy();
    blitCache.delete(device);
  }
}

export function copyImageToTexture(
  device: GPUDevice,
  texture: GPUTexture,
  write: TextureImageWriteLayout,
): void {
  device.queue.copyExternalImageToTexture(
    {
      source: write.source,
      ...((write.sourceOrigin.x !== 0 || write.sourceOrigin.y !== 0) && {
        origin: write.sourceOrigin,
      }),
      ...(write.flipY !== undefined && { flipY: write.flipY }),
    },
    {
      texture,
      mipLevel: write.mipLevel,
      origin: write.targetOrigin,
    },
    write.targetSize,
  );
}

function validateBlitFormat(
  device: GPUDevice,
  format: GPUTextureFormat,
  operation: string,
): {
  filterable: boolean;
  sampleType: GPUTextureSampleType;
} {
  const info = getTextureFormatInfo(format);
  const effectiveSampleTypes = getEffectiveSampleTypes(device, format);

  const isFloat = effectiveSampleTypes.includes('float');
  const isUnfilterableFloat = effectiveSampleTypes.includes('unfilterable-float');

  if (!isFloat && !isUnfilterableFloat) {
    throw new Error(
      `Cannot ${operation} for format '${format}': only float formats are supported.`,
    );
  }

  if (!info.canRenderAttachment) {
    throw new Error(
      `Cannot ${operation} for format '${format}': format does not support render attachments.`,
    );
  }

  return {
    filterable: isFloat,
    sampleType: isFloat ? 'float' : 'unfilterable-float',
  };
}

function targetViewDescriptor(write: TextureImageWriteLayout): GPUTextureViewDescriptor {
  return {
    dimension: '2d',
    baseMipLevel: write.mipLevel,
    mipLevelCount: 1,
    baseArrayLayer: write.targetOrigin.z,
    arrayLayerCount: 1,
  };
}

function targetViewport(write: TextureImageWriteLayout): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: write.targetOrigin.x,
    y: write.targetOrigin.y,
    width: write.targetSize.width,
    height: write.targetSize.height,
  };
}

export function generateTextureMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  baseMipLevel = 0,
  mipLevels?: number,
): void {
  if (texture.dimension !== '2d') {
    throw new Error('Mipmap generation only supports 2D textures.');
  }

  const { filterable, sampleType } = validateBlitFormat(device, texture.format, 'generate mipmaps');
  const levels = mipLevels ?? texture.mipLevelCount - baseMipLevel;

  for (let layer = 0; layer < texture.depthOrArrayLayers; layer++) {
    for (let mip = baseMipLevel; mip < baseMipLevel + levels - 1; mip++) {
      const viewOptions = (level: number) => ({
        dimension: '2d' as const,
        baseMipLevel: level,
        mipLevelCount: 1,
        baseArrayLayer: layer,
        arrayLayerCount: 1,
      });

      blit({
        device,
        source: texture.createView(viewOptions(mip)),
        destination: texture.createView(viewOptions(mip + 1)),
        format: texture.format,
        filterable,
        sampleType,
      });
    }
  }
}

export function resampleImage(
  device: GPUDevice,
  targetTexture: GPUTexture,
  write: TextureImageWriteLayout,
): void {
  if (targetTexture.dimension !== '2d') {
    throw new Error('Resampling only supports 2D textures.');
  }

  const { filterable } = validateBlitFormat(device, targetTexture.format, 'resample');
  const inputTexture = getStagedImageTexture(device, write, targetTexture.format);

  const encoder = device.createCommandEncoder();

  blit({
    device,
    source: inputTexture.createView(),
    destination: targetTexture.createView(targetViewDescriptor(write)),
    format: targetTexture.format,
    filterable,
    sampleType: 'float',
    ...(write.filter !== undefined && { filter: write.filter }),
    encoder,
    loadOp: 'load',
    viewport: targetViewport(write),
  });

  device.queue.submit([encoder.finish()]);
}

export function writeTextureChannel(
  device: GPUDevice,
  targetTexture: GPUTexture,
  write: TextureChannelWriteLayout,
): void {
  if (targetTexture.dimension !== '2d') {
    throw new Error('Channel writes only support 2D textures.');
  }

  const { filterable } = validateBlitFormat(device, targetTexture.format, 'write channels');
  const inputTexture = getStagedImageTexture(device, write, targetTexture.format);
  const resources = getBlitResources(device, filterable, 'float', write.filter);
  const pipeline = device.createRenderPipeline({
    layout: resources.pipelineLayout,
    vertex: { module: resources.vertexModule },
    fragment: {
      module: getChannelShaderModule(device, write.from),
      targets: [{ format: targetTexture.format, writeMask: channelWriteMask(write.to) }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const bindGroup = device.createBindGroup({
    layout: resources.bindGroupLayout,
    entries: [
      { binding: 0, resource: inputTexture.createView() },
      { binding: 1, resource: resources.sampler },
    ],
  });
  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: targetTexture.createView(targetViewDescriptor(write)),
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });
  const viewport = targetViewport(write);
  pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
  pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();

  device.queue.submit([encoder.finish()]);
}

import { getEffectiveSampleTypes, getTextureFormatInfo } from './textureFormats.ts';
import type { ExternalImageSource } from './texture.ts';

export function getImageSourceDimensions(source: ExternalImageSource): {
  width: number;
  height: number;
} {
  const { videoWidth, videoHeight } = source as HTMLVideoElement;
  if (videoWidth && videoHeight) {
    return { width: videoWidth, height: videoHeight };
  }

  const { naturalWidth, naturalHeight } = source as HTMLImageElement;
  if (naturalWidth && naturalHeight) {
    return { width: naturalWidth, height: naturalHeight };
  }

  const { codedWidth, codedHeight } = source as VideoFrame;
  if (codedWidth && codedHeight) {
    return { width: codedWidth, height: codedHeight };
  }

  const { width, height } = source as ImageBitmap;
  if (width && height) {
    return { width, height };
  }

  throw new Error('Cannot determine dimensions of the provided image source.');
}

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

type BlitResources = {
  vertexModule: GPUShaderModule;
  fragmentModule: GPUShaderModule;
  bindGroupLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  sampler: GPUSampler;
};

type DeviceCache = {
  vertexModule: GPUShaderModule;
  filterableResources: Map<boolean, { fragmentModule: GPUShaderModule; sampler: GPUSampler }>;
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
      layoutResources: new Map(),
    };
    blitCache.set(device, cache);
  }
  return cache;
}

function getBlitResources(
  device: GPUDevice,
  filterable: boolean,
  sampleType: GPUTextureSampleType,
): BlitResources {
  const cache = getOrCreateDeviceCache(device);

  let filterableRes = cache.filterableResources.get(filterable);
  if (!filterableRes) {
    filterableRes = {
      fragmentModule: device.createShaderModule({
        code: filterable ? SAMPLE_FRAGMENT_SHADER : GATHER_FRAGMENT_SHADER,
      }),
      sampler: device.createSampler(filterable ? { magFilter: 'linear', minFilter: 'linear' } : {}),
    };
    cache.filterableResources.set(filterable, filterableRes);
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
  encoder?: GPUCommandEncoder;
};

function blit(options: BlitOptions): void {
  const { device, source, destination, format, filterable, sampleType } = options;
  const resources = getBlitResources(device, filterable, sampleType);

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
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();

  if (ownEncoder) {
    device.queue.submit([encoder.finish()]);
  }
}

export function clearTextureUtilsCache(device: GPUDevice): void {
  blitCache.delete(device);
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
  image: ExternalImageSource,
  layer = 0,
): void {
  if (targetTexture.dimension !== '2d') {
    throw new Error('Resampling only supports 2D textures.');
  }

  const { filterable } = validateBlitFormat(device, targetTexture.format, 'resample');
  const { width, height } = getImageSourceDimensions(image);

  const inputTexture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: image },
    {
      texture: inputTexture,
    },
    [width, height],
  );

  const renderTexture = device.createTexture({
    size: [targetTexture.width, targetTexture.height],
    format: targetTexture.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const encoder = device.createCommandEncoder();

  blit({
    device,
    source: inputTexture.createView(),
    destination: renderTexture.createView(),
    format: targetTexture.format,
    filterable,
    sampleType: 'float', // Input is always rgba8unorm which is filterable
    encoder,
  });

  encoder.copyTextureToTexture(
    { texture: renderTexture },
    { texture: targetTexture, origin: { x: 0, y: 0, z: layer } },
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

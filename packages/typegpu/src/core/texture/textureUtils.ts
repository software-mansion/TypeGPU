import { getEffectiveSampleTypes, getTextureFormatInfo } from './textureFormats.ts';
import { type ImageWrite, sameSize, type TextureChannel } from './textureWrite.ts';

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

const sampleFragmentShader = (channel?: TextureChannel) => `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(src, samp, uv)${channel ? `.${channel.repeat(4)}` : ''};
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

const CHANNEL_WRITE_MASKS = { r: 0x1, g: 0x2, b: 0x4, a: 0x8 } as const;

const deviceCaches = new WeakMap<GPUDevice, Map<string, unknown>>();

function cached<T>(device: GPUDevice, key: string, create: () => T): T {
  let cache = deviceCaches.get(device);
  if (!cache) {
    cache = new Map();
    deviceCaches.set(device, cache);
  }
  if (!cache.has(key)) {
    cache.set(key, create());
  }
  return cache.get(key) as T;
}

export function clearTextureUtilsCache(device: GPUDevice): void {
  deviceCaches.delete(device);
}

type BlitConfig = {
  format: GPUTextureFormat;
  filterable: boolean;
  filter?: GPUFilterMode | undefined;
  channel?: ImageWrite['channel'];
};

function blit(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  { format, filterable, filter = 'linear', channel }: BlitConfig,
  source: GPUTextureView,
  attachment: GPURenderPassColorAttachment,
  viewport?: readonly [x: number, y: number, width: number, height: number],
): void {
  const sampleType = filterable ? 'float' : 'unfilterable-float';
  const bindGroupLayout = cached(device, `layout:${sampleType}`, () =>
    device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: filterable ? 'filtering' : 'non-filtering' },
        },
      ],
    }),
  );

  const channelKey = channel ? `${channel.from}${channel.to}` : '';
  const pipeline = cached(device, `pipeline:${format}:${sampleType}:${channelKey}`, () =>
    device.createRenderPipeline({
      layout: cached(device, `pipelineLayout:${sampleType}`, () =>
        device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      ),
      vertex: {
        module: cached(device, 'vertex', () =>
          device.createShaderModule({ code: FULLSCREEN_VERTEX_SHADER }),
        ),
      },
      fragment: {
        module: cached(device, `fragment:${sampleType}:${channel?.from ?? ''}`, () =>
          device.createShaderModule({
            code: filterable ? sampleFragmentShader(channel?.from) : GATHER_FRAGMENT_SHADER,
          }),
        ),
        targets: [channel ? { format, writeMask: CHANNEL_WRITE_MASKS[channel.to] } : { format }],
      },
    }),
  );

  const sampler = cached(device, `sampler:${filterable && filter}`, () =>
    device.createSampler(filterable ? { magFilter: filter, minFilter: filter } : {}),
  );

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: source },
      { binding: 1, resource: sampler },
    ],
  });

  const pass = encoder.beginRenderPass({ colorAttachments: [attachment] });
  if (viewport) {
    pass.setViewport(...viewport, 0, 1);
    pass.setScissorRect(...viewport);
  }
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}

function layerView(texture: GPUTexture, mipLevel: number, layer: number): GPUTextureView {
  const is3d = texture.dimension === '3d';
  return texture.createView({
    dimension: is3d ? '3d' : '2d',
    baseMipLevel: mipLevel,
    mipLevelCount: 1,
    baseArrayLayer: is3d ? 0 : layer,
    arrayLayerCount: 1,
  });
}

function layerAttachment(
  texture: GPUTexture,
  mipLevel: number,
  layer: number,
  loadOp: GPULoadOp,
): GPURenderPassColorAttachment {
  return {
    view: layerView(texture, mipLevel, layer),
    ...(texture.dimension === '3d' && { depthSlice: layer }),
    loadOp,
    storeOp: 'store',
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

  const { format } = texture;
  const sampleTypes = getEffectiveSampleTypes(device, format);
  const filterable = sampleTypes.includes('float');

  if (!filterable && !sampleTypes.includes('unfilterable-float')) {
    throw new Error(
      `Cannot generate mipmaps for format '${format}': only float formats are supported.`,
    );
  }
  if (!getTextureFormatInfo(format).canRenderAttachment) {
    throw new Error(
      `Cannot generate mipmaps for format '${format}': format does not support render attachments.`,
    );
  }

  const levels = mipLevels ?? texture.mipLevelCount - baseMipLevel;
  const encoder = device.createCommandEncoder();

  for (let layer = 0; layer < texture.depthOrArrayLayers; layer++) {
    for (let mip = baseMipLevel; mip < baseMipLevel + levels - 1; mip++) {
      blit(
        device,
        encoder,
        { format, filterable },
        layerView(texture, mip, layer),
        layerAttachment(texture, mip + 1, layer, 'clear'),
      );
    }
  }

  device.queue.submit([encoder.finish()]);
}

export function clearTextureWithColor(
  device: GPUDevice,
  texture: GPUTexture,
  color: readonly [number, number, number, number],
  mipLevels: readonly number[],
): void {
  const encoder = device.createCommandEncoder();

  for (const mipLevel of mipLevels) {
    const layers =
      texture.dimension === '3d'
        ? Math.max(1, texture.depthOrArrayLayers >> mipLevel)
        : texture.depthOrArrayLayers;

    for (let layer = 0; layer < layers; layer++) {
      encoder
        .beginRenderPass({
          colorAttachments: [
            { ...layerAttachment(texture, mipLevel, layer, 'clear'), clearValue: [...color] },
          ],
        })
        .end();
    }
  }

  device.queue.submit([encoder.finish()]);
}

function copyImage(
  device: GPUDevice,
  write: ImageWrite,
  destination: GPUTexelCopyTextureInfo,
  size: number[],
): void {
  const { flipY = false, premultipliedAlpha = false, colorSpace = 'srgb' } = write.options;
  device.queue.copyExternalImageToTexture(
    { source: write.source, origin: write.sourceOrigin, flipY },
    { ...destination, premultipliedAlpha, colorSpace },
    size,
  );
}

function stageImage(device: GPUDevice, write: ImageWrite, format: GPUTextureFormat): GPUTexture {
  const texture = device.createTexture({
    size: write.sourceSize,
    format,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  copyImage(device, write, { texture }, write.sourceSize);
  return texture;
}

function stagingFormat(format: GPUTextureFormat): GPUTextureFormat {
  if (format.endsWith('-srgb')) {
    return format;
  }
  return format.endsWith('8unorm') ? 'rgba8unorm' : 'rgba16float';
}

export function writeImages(
  device: GPUDevice,
  texture: GPUTexture,
  writes: readonly ImageWrite[],
): void {
  const isCopy = (write: ImageWrite) => !write.channel && sameSize(write.sourceSize, write.size);
  const bySource = new Map<GPUCopyExternalImageSource, ImageWrite[]>();

  for (const write of writes) {
    if (isCopy(write) && texture.dimension === '2d') {
      copyImage(
        device,
        write,
        { texture, mipLevel: write.mipLevel, origin: write.origin },
        write.size,
      );
    } else {
      bySource.set(write.source, [...(bySource.get(write.source) ?? []), write]);
    }
  }

  for (const group of bySource.values()) {
    const encoder = device.createCommandEncoder();
    let staged: GPUTexture | undefined;

    for (const write of group) {
      if (isCopy(write)) {
        // copyExternalImageToTexture only accepts 2d destinations, so 3d writes stage through a 2d texture
        staged ??= stageImage(device, write, texture.format);
        encoder.copyTextureToTexture(
          { texture: staged },
          { texture, mipLevel: write.mipLevel, origin: write.origin },
          [...write.size, 1],
        );
      } else {
        staged ??= stageImage(device, write, stagingFormat(texture.format));
        blit(
          device,
          encoder,
          {
            format: texture.format,
            filterable: true,
            filter: write.options.filter,
            channel: write.channel,
          },
          staged.createView(),
          layerAttachment(texture, write.mipLevel, write.origin.z, 'load'),
          [write.origin.x, write.origin.y, ...write.size],
        );
      }
    }

    device.queue.submit([encoder.finish()]);
    staged?.destroy();
  }
}

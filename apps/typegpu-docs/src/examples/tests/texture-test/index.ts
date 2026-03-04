import tgpu, { common, d } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const imageBitmap = await createImageBitmap(await (await fetch('/TypeGPU/plums.jpg')).blob());

const testFormats = [
  'rgba8unorm',
  'rgba8unorm-srgb',
  'bgra8unorm',
  'rgba16float',
  'rgba32float',
  'rg16float',
  'r16float',
  'rgb10a2unorm',
] as const;

type TestFormat = (typeof testFormats)[number];

const sizePresets = {
  Original: [imageBitmap.width, imageBitmap.height],
  '256x256': [256, 256],
  '512x512': [512, 512],
  '1024x1024': [1024, 1024],
  '300x500': [300, 500],
} as const;

const hasFloat32Filterable = root.device.features.has('float32-filterable');

function isFilterable(format: GPUTextureFormat): boolean {
  return !(format === 'rgba32float' && !hasFloat32Filterable);
}

let currentFormat: TestFormat = 'rgba16float';
let currentSize = sizePresets.Original;

function calculateMipLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.min(width, height))) + 1;
}

function createTestTexture(format: TestFormat, size: readonly [number, number]) {
  const mipLevels = calculateMipLevels(size[0], size[1]);
  console.log(
    `Creating texture: ${format}, size: ${size[0]}x${
      size[1]
    }, mips: ${mipLevels}, filterable: ${isFilterable(format)}`,
  );

  return root['~unstable']
    .createTexture({
      size,
      format,
      mipLevelCount: mipLevels,
    })
    .$usage('sampled', 'render');
}

const biasUniform = root.createUniform(d.f32);
const channelUniform = root.createUniform(d.i32);

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const nearestSampler = root['~unstable'].createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
  mipmapFilter: 'nearest',
});

function createPipelineForFormat(format: TestFormat) {
  const filterable = isFilterable(format);
  const layout = tgpu.bindGroupLayout({
    myTexture: {
      texture: d.texture2d(d.f32),
      ...(!filterable && { sampleType: 'unfilterable-float' as const }),
    },
  });

  const sampler = filterable ? filteringSampler : nearestSampler;

  const fragmentFunction = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })`{
    let color = textureSampleBias(layout.$.myTexture, sampler, in.uv, bias);

    if (channel == 1) { return vec4f(color.rrr, 1.0); }
    if (channel == 2) { return vec4f(color.ggg, 1.0); }
    if (channel == 3) { return vec4f(color.bbb, 1.0); }
    if (channel == 4) { return vec4f(color.aaa, 1.0); }

    return color;
  }`.$uses({
    layout,
    sampler,
    bias: biasUniform,
    channel: channelUniform,
  });

  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: fragmentFunction,
    targets: { format: presentationFormat },
  });

  return { layout, pipeline };
}

let texture = createTestTexture(currentFormat, currentSize);
texture.write(imageBitmap);
texture.generateMipmaps();

let { layout, pipeline } = createPipelineForFormat(currentFormat);
let bindGroup = root.createBindGroup(layout, { myTexture: texture });

function recreateTexture() {
  texture = createTestTexture(currentFormat, currentSize);
  texture.write(imageBitmap);
  texture.generateMipmaps();
  ({ layout, pipeline } = createPipelineForFormat(currentFormat));
  bindGroup = root.createBindGroup(layout, { myTexture: texture });
}

function render() {
  pipeline.with(bindGroup).withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

export const controls = defineControls({
  Format: {
    initial: currentFormat,
    options: [...testFormats],
    onSelectChange: (value) => {
      currentFormat = value;
      recreateTexture();
    },
  },
  Size: {
    initial: 'Original',
    options: [...Object.keys(sizePresets), 'Random'],
    onSelectChange: (value) => {
      if (value === 'Random') {
        const randomWidth = Math.floor(Math.random() * 1024) + 64;
        const randomHeight = Math.floor(Math.random() * 1024) + 64;
        currentSize = [randomWidth, randomHeight];
        console.log(`Random size selected: ${randomWidth}x${randomHeight}`);
      } else {
        currentSize = sizePresets[value as keyof typeof sizePresets] as readonly [number, number];
      }
      recreateTexture();
    },
  },
  Channel: {
    initial: 'RGBA',
    options: ['RGBA', 'R', 'G', 'B', 'A'],
    onSelectChange: (value) => {
      channelUniform.write({ RGBA: 0, R: 1, G: 2, B: 3, A: 4 }[value] ?? 0);
    },
  },
  'Mip bias': {
    initial: 0,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (value) => biasUniform.write(value),
  },
  Clear: {
    onButtonClick: () => texture.clear(),
  },
});

export function onCleanup() {
  root.destroy();
}

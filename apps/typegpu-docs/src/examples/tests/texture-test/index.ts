import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const imageBlob = await (await fetch('/TypeGPU/plums.jpg')).blob();
const imageBitmap = await createImageBitmap(imageBlob);

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
type WriteKind = 'resize' | 'crop' | 'blob' | 'greenToRed' | 'clear';

const hasFloat32Filterable = root.device.features.has('float32-filterable');

function isFilterable(format: GPUTextureFormat): boolean {
  return !(format === 'rgba32float' && !hasFloat32Filterable);
}

let currentFormat: TestFormat = 'rgba16float';
let currentSize: readonly [number, number] = [imageBitmap.width, imageBitmap.height];
let cropX = 25;
let cropY = 25;
let cropSize = 50;
let activeWrite: WriteKind = 'resize';

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

  return root
    .createTexture({
      size,
      format,
      mipLevelCount: mipLevels,
    })
    .$usage('sampled', 'render');
}

const biasUniform = root.createUniform(d.f32);
const channelUniform = root.createUniform(d.i32);

const filteringSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const nearestSampler = root.createSampler({
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
  })(({ uv }) => {
    const color = std.textureSampleBias(layout.$.myTexture, sampler.$, uv, biasUniform.$);

    if (channelUniform.$ === 1) return d.vec4f(color.rrr, 1);
    if (channelUniform.$ === 2) return d.vec4f(color.ggg, 1);
    if (channelUniform.$ === 3) return d.vec4f(color.bbb, 1);
    if (channelUniform.$ === 4) return d.vec4f(color.aaa, 1);

    return color;
  });

  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: fragmentFunction,
    targets: { format: presentationFormat },
  });

  return { layout, pipeline };
}

let texture = createTestTexture(currentFormat, currentSize);

function cropRect() {
  const sourceSize: readonly [number, number] = [
    Math.max(1, Math.floor((imageBitmap.width * cropSize) / 100)),
    Math.max(1, Math.floor((imageBitmap.height * cropSize) / 100)),
  ];
  const sourceOrigin: readonly [number, number] = [
    Math.floor(((imageBitmap.width - sourceSize[0]) * cropX) / 100),
    Math.floor(((imageBitmap.height - sourceSize[1]) * cropY) / 100),
  ];
  return { sourceOrigin, sourceSize };
}

function writeResizedContent() {
  texture.write(imageBitmap, { resize: true });
  texture.generateMipmaps();
}

function writeCroppedContent() {
  texture.write({
    source: imageBitmap,
    ...cropRect(),
    size: currentSize,
    resize: true,
  });
  texture.generateMipmaps();
}

async function writeBlobContent() {
  const target = texture;
  await target.writeAsync({ source: imageBlob, size: currentSize, resize: true });
  if (!target.destroyed) {
    target.generateMipmaps();
  }
}

function writeGreenToRedContent() {
  texture.clear();
  common.writeChannels(
    texture,
    { r: { source: imageBitmap, from: 'g' } },
    { size: currentSize, resize: true },
  );
  texture.generateMipmaps();
}

function clearContent() {
  texture.clear();
}

async function writeActiveContent() {
  if (activeWrite === 'resize') {
    writeResizedContent();
  } else if (activeWrite === 'crop') {
    writeCroppedContent();
  } else if (activeWrite === 'blob') {
    await writeBlobContent();
  } else if (activeWrite === 'greenToRed') {
    writeGreenToRedContent();
  } else {
    clearContent();
  }
}

await writeActiveContent();

let { layout, pipeline } = createPipelineForFormat(currentFormat);
let bindGroup = root.createBindGroup(layout, { myTexture: texture });

function recreateTexture() {
  texture.destroy();
  texture = createTestTexture(currentFormat, currentSize);
  ({ layout, pipeline } = createPipelineForFormat(currentFormat));
  bindGroup = root.createBindGroup(layout, { myTexture: texture });
}

function write(writeKind = activeWrite) {
  activeWrite = writeKind;
  recreateTexture();
  return writeActiveContent();
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
      void write();
    },
  },
  'Target width': {
    initial: currentSize[0],
    min: 64,
    max: 1024,
    step: 1,
    onSliderChange: (value) => {
      currentSize = [Math.round(value), currentSize[1]];
      void write();
    },
  },
  'Target height': {
    initial: currentSize[1],
    min: 64,
    max: 1024,
    step: 1,
    onSliderChange: (value) => {
      currentSize = [currentSize[0], Math.round(value)];
      void write();
    },
  },
  'Crop X': {
    initial: cropX,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropX = value;
      void write('crop');
    },
  },
  'Crop Y': {
    initial: cropY,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropY = value;
      void write('crop');
    },
  },
  'Crop size': {
    initial: cropSize,
    min: 1,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropSize = value;
      void write('crop');
    },
  },
  'Write blob': {
    onButtonClick: () => write('blob'),
  },
  'Write G->R': {
    onButtonClick: () => write('greenToRed'),
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
    onButtonClick: () => write('clear'),
  },
});

export function onCleanup() {
  root.destroy();
}

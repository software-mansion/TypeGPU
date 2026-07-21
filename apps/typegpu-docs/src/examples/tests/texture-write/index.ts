import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

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

const hasFloat32Filterable = root.device.features.has('float32-filterable');

function isFilterable(format: TestFormat): boolean {
  return !(format === 'rgba32float' && !hasFloat32Filterable);
}

let currentFormat: TestFormat = 'rgba16float';
let currentSize: readonly [number, number] = [imageBitmap.width, imageBitmap.height];
let cropX = 0;
let cropY = 0;
let cropSize = 100;
let writeTarget: 'full' | 'center' = 'full';
let flipY = false;
let filter: GPUFilterMode = 'linear';

const channelUniform = root.createUniform(d.i32);

const filteringSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const nearestSampler = root.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

const viewChannel = (color: d.v4f) => {
  'use gpu';
  if (channelUniform.$ === 1) {
    return d.vec4f(color.rrr, 1);
  }
  if (channelUniform.$ === 2) {
    return d.vec4f(color.ggg, 1);
  }
  if (channelUniform.$ === 3) {
    return d.vec4f(color.bbb, 1);
  }
  if (channelUniform.$ === 4) {
    return d.vec4f(color.aaa, 1);
  }
  return d.vec4f(color);
};

function createViewer(filterable: boolean) {
  const layout = tgpu.bindGroupLayout({
    tex: {
      texture: d.texture2d(d.f32),
      ...(!filterable && { sampleType: 'unfilterable-float' as const }),
    },
  });
  const sampler = filterable ? filteringSampler : nearestSampler;

  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu';
      const color = std.textureSample(layout.$.tex, sampler.$, uv);
      return viewChannel(color);
    },
  });

  return { layout, pipeline };
}

const filterableViewer = createViewer(true);
const unfilterableViewer = createViewer(false);

function createTestTexture() {
  return root
    .createTexture({ size: currentSize, format: currentFormat })
    .$usage('sampled', 'render');
}

function cropRect() {
  const width = Math.max(1, Math.floor((imageBitmap.width * cropSize) / 100));
  const height = Math.max(1, Math.floor((imageBitmap.height * cropSize) / 100));
  return {
    sourceOrigin: [
      Math.floor(((imageBitmap.width - width) * cropX) / 100),
      Math.floor(((imageBitmap.height - height) * cropY) / 100),
    ],
    sourceSize: [width, height],
  } as const;
}

function writeImage() {
  texture.clear();
  const target =
    writeTarget === 'center'
      ? ({
          origin: [Math.floor(currentSize[0] / 4), Math.floor(currentSize[1] / 4)],
          size: [Math.floor(currentSize[0] / 2), Math.floor(currentSize[1] / 2)],
        } as const)
      : { size: currentSize };
  texture.write(imageBitmap, {
    ...cropRect(),
    ...target,
    resize: true,
    flipY,
    filter,
  });
}

async function writeBlob() {
  await texture.writeAsync(imageBlob, { resize: true, filter });
}

let texture = createTestTexture();
let viewer = filterableViewer;
let bindGroup = root.createBindGroup(viewer.layout, { tex: texture });
writeImage();

function rebuild() {
  texture.destroy();
  texture = createTestTexture();
  viewer = isFilterable(currentFormat) ? filterableViewer : unfilterableViewer;
  bindGroup = root.createBindGroup(viewer.layout, { tex: texture });
  writeImage();
}

function render() {
  viewer.pipeline.with(bindGroup).withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

export const controls = defineControls({
  Format: {
    initial: currentFormat,
    options: [...testFormats],
    onSelectChange: (value) => {
      currentFormat = value;
      rebuild();
    },
  },
  'Target width': {
    initial: currentSize[0],
    min: 64,
    max: 1024,
    step: 1,
    onSliderChange: (value) => {
      currentSize = [Math.round(value), currentSize[1]];
      rebuild();
    },
  },
  'Target height': {
    initial: currentSize[1],
    min: 64,
    max: 1024,
    step: 1,
    onSliderChange: (value) => {
      currentSize = [currentSize[0], Math.round(value)];
      rebuild();
    },
  },
  'Crop X': {
    initial: cropX,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropX = value;
      writeImage();
    },
  },
  'Crop Y': {
    initial: cropY,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropY = value;
      writeImage();
    },
  },
  'Crop size': {
    initial: cropSize,
    min: 1,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      cropSize = value;
      writeImage();
    },
  },
  'Write to': {
    initial: writeTarget,
    options: ['full', 'center'],
    onSelectChange: (value) => {
      writeTarget = value;
      writeImage();
    },
  },
  'Flip Y': {
    initial: flipY,
    onToggleChange: (value) => {
      flipY = value;
      writeImage();
    },
  },
  Filter: {
    initial: filter,
    options: ['linear', 'nearest'],
    onSelectChange: (value) => {
      filter = value;
      writeImage();
    },
  },
  'Write blob': {
    onButtonClick: () => writeBlob(),
  },
  Channel: {
    initial: 'RGBA',
    options: ['RGBA', 'R', 'G', 'B', 'A'],
    onSelectChange: (value) => {
      channelUniform.write({ RGBA: 0, R: 1, G: 2, B: 3, A: 4 }[value] ?? 0);
    },
  },
});

export function onCleanup() {
  root.destroy();
}

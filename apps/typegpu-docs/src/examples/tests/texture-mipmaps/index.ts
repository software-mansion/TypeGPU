import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const imageBlob = await (await fetch('/TypeGPU/plums.jpg')).blob();
const imageBitmap = await createImageBitmap(imageBlob);

const textureSize = 256;
const mipLevelCount = Math.log2(textureSize) + 1;
const layerCount = 2;

const texture = root
  .createTexture({
    size: [textureSize, textureSize, layerCount],
    format: 'rgba8unorm',
    mipLevelCount,
  })
  .$usage('sampled', 'render');

// this exists only so I don't have to ship another image as an asset
function createPatternCanvas(size: number): OffscreenCanvas {
  const pattern = new OffscreenCanvas(size, size);
  const ctx = pattern.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#ff2080');
  gradient.addColorStop(1, '#2080ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size / 32;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (i * size) / 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  return pattern;
}

const patternCanvas = createPatternCanvas(512);

const mipColors = [
  [1, 0, 0, 1],
  [1, 0.5, 0, 1],
  [1, 1, 0, 1],
  [0, 1, 0, 1],
  [0, 1, 1, 1],
  [0, 0.5, 1, 1],
  [0, 0, 1, 1],
  [0.5, 0, 1, 1],
  [1, 0, 1, 1],
] as const;

let viewMip = 0;
let viewLayer = 0;
let baseMip = 0;

function writeLayerImages() {
  texture.write([imageBitmap, patternCanvas], { resize: true });
  texture.generateMipmaps();
}

function paintMipColors() {
  mipColors.forEach((color, i) => texture.clear(color, i));
}

function writeRawCheckerboard() {
  const mip = Math.round(viewMip);
  const mipSize = Math.max(1, textureSize >> mip);
  const cell = Math.max(1, mipSize >> 3);
  const data = new Uint8Array(mipSize * mipSize * 4);
  for (let y = 0; y < mipSize; y++) {
    for (let x = 0; x < mipSize; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const i = (y * mipSize + x) * 4;
      data[i] = on ? 255 : 20;
      data[i + 1] = on ? 40 : 20;
      data[i + 2] = on ? 220 : 20;
      data[i + 3] = 255;
    }
  }
  texture.write(data, { mipLevel: mip, origin: [0, 0, viewLayer], size: [mipSize, mipSize, 1] });
}

const mipUniform = root.createUniform(d.f32);
const layerUniform = root.createUniform(d.i32);

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const sampledView = texture.createView(d.texture2dArray());

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    return std.textureSampleLevel(sampledView.$, sampler.$, uv, layerUniform.$, mipUniform.$);
  },
});

writeLayerImages();

function render() {
  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

export const controls = defineControls({
  'Mip level': {
    initial: viewMip,
    min: 0,
    max: mipLevelCount - 1,
    step: 0.1,
    onSliderChange: (value) => {
      viewMip = value;
      mipUniform.write(value);
    },
  },
  Layer: {
    initial: viewLayer,
    min: 0,
    max: layerCount - 1,
    step: 1,
    onSliderChange: (value) => {
      viewLayer = value;
      layerUniform.write(value);
    },
  },
  'Write layer images': {
    onButtonClick: () => writeLayerImages(),
  },
  'Paint mip colors': {
    onButtonClick: () => paintMipColors(),
  },
  'Raw checkerboard': {
    onButtonClick: () => writeRawCheckerboard(),
  },
  'Base mip': {
    initial: baseMip,
    min: 0,
    max: mipLevelCount - 1,
    step: 1,
    onSliderChange: (value) => {
      baseMip = value;
    },
  },
  'Generate mips from base': {
    onButtonClick: () => texture.generateMipmaps(baseMip),
  },
  'Clear viewed mip': {
    onButtonClick: () => texture.clear(Math.round(viewMip)),
  },
  'Clear all': {
    onButtonClick: () => texture.clear(),
  },
});

export function onCleanup() {
  root.destroy();
}

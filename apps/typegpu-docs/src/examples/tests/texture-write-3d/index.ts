import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const imageBlob = await (await fetch('/TypeGPU/plums.jpg')).blob();
const imageBitmap = await createImageBitmap(imageBlob);

const textureSize = 256;
const depth = 8;
const mipLevelCount = 4;
const marchSteps = 96;

const texture = root
  .createTexture({
    size: [textureSize, textureSize, depth],
    format: 'rgba8unorm',
    dimension: '3d',
    mipLevelCount,
  })
  .$usage('sampled', 'render');

// each slice pans through a different crop of the image, so slices are
// spatially decorrelated and depth-axis mip averaging is visible as ghosting
function tintedSlice(size: number, z: number, extraFilter = ''): OffscreenCanvas {
  const slice = new OffscreenCanvas(size, size);
  const ctx = slice.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.filter = `hue-rotate(${z * (360 / depth)}deg)${extraFilter}`;
  const cropWidth = imageBitmap.width * 0.6;
  const cropHeight = imageBitmap.height * 0.6;
  const pan = z / (depth - 1);
  ctx.drawImage(
    imageBitmap,
    (imageBitmap.width - cropWidth) * pan,
    (imageBitmap.height - cropHeight) * pan,
    cropWidth,
    cropHeight,
    0,
    0,
    size,
    size,
  );
  return slice;
}

function buildSlices(size: number, extraFilter = ''): OffscreenCanvas[] {
  return Array.from({ length: depth }, (_, z) => tintedSlice(size, z, extraFilter));
}

function mipDepth(mip: number): number {
  return Math.max(1, depth >> mip);
}

function sliceAt(slices: OffscreenCanvas[], i: number): OffscreenCanvas {
  return slices[Math.min(i, slices.length - 1)];
}

function averagedSlice(size: number, a: OffscreenCanvas, b: OffscreenCanvas): OffscreenCanvas {
  const out = new OffscreenCanvas(size, size);
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(a, 0, 0, size, size);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(b, 0, 0, size, size);
  return out;
}

function writeMipsFrom(baseSlices: OffscreenCanvas[]) {
  let prev = baseSlices;
  for (let mip = 1; mip < mipLevelCount; mip++) {
    const size = textureSize >> mip;
    const slices = Array.from({ length: mipDepth(mip) }, (_, s) =>
      averagedSlice(size, sliceAt(prev, 2 * s), sliceAt(prev, 2 * s + 1)),
    );
    texture.write(slices, { mipLevel: mip });
    prev = slices;
  }
}

function writeVolumeDirect() {
  const slices = buildSlices(textureSize);
  texture.write(slices);
  writeMipsFrom(slices);
}

function writeVolumeStretch() {
  const slices = buildSlices(384, ' saturate(3)');
  texture.write(slices, { fit: 'stretch' });
  writeMipsFrom(slices);
}

let checkerboardSlice = 0;

function writeRawCheckerboardSlice() {
  const cell = textureSize >> 3;
  const data = new Uint8Array(textureSize * textureSize * 4);
  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const i = (y * textureSize + x) * 4;
      data[i] = on ? 255 : 20;
      data[i + 1] = on ? 40 : 20;
      data[i + 2] = on ? 220 : 20;
      data[i + 3] = 255;
    }
  }
  texture.write(data, {
    origin: [0, 0, checkerboardSlice],
    size: [textureSize, textureSize, 1],
  });
}

const lodUniform = root.createUniform(d.f32);
const densityUniform = root.createUniform(d.f32, 6);
const angleUniform = root.createUniform(d.f32);

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const sampledView = texture.createView(d.texture3d());

const rayBox = (ro: d.v3f, rd: d.v3f) => {
  'use gpu';
  const invDir = d.vec3f(1) / rd;
  const t0 = (d.vec3f(-0.5) - ro) * invDir;
  const t1 = (d.vec3f(0.5) - ro) * invDir;
  const tMin = std.min(t0, t1);
  const tMax = std.max(t0, t1);
  const tNear = std.max(std.max(tMin.x, tMin.y), tMin.z);
  const tFar = std.min(std.min(tMax.x, tMax.y), tMax.z);
  return d.vec2f(tNear, tFar);
};

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const angle = angleUniform.$;
    const ro = d.vec3f(std.sin(angle) * 1.8, 0.6, std.cos(angle) * 1.8);
    const forward = std.normalize(ro * -1);
    const right = std.normalize(std.cross(d.vec3f(0, 1, 0), forward));
    const up = std.cross(forward, right);
    const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
    const rd = std.normalize(forward * 1.5 + right * ndc.x + up * ndc.y);

    const hit = rayBox(ro, rd);
    const tNear = std.max(hit.x, 0);
    let color = d.vec3f(0);
    let transmittance = d.f32(1);

    if (hit.y > tNear) {
      const stepSize = (hit.y - tNear) / marchSteps;
      for (let i = 0; i < marchSteps; i++) {
        const p = ro + rd * (tNear + (d.f32(i) + 0.5) * stepSize);
        const coord = d.vec3f(p.x + 0.5, 0.5 - p.y, p.z + 0.5);
        const texel = std.textureSampleLevel(sampledView.$, sampler.$, coord, lodUniform.$);
        const density =
          std.dot(texel.rgb, d.vec3f(0.299, 0.587, 0.114)) * densityUniform.$ * stepSize;
        color = d.vec3f(color + texel.rgb * (density * transmittance));
        transmittance = transmittance * std.exp(-density);
      }
    }

    return d.vec4f(color + d.vec3f(0.02) * transmittance, 1);
  },
});

writeVolumeDirect();

function render() {
  angleUniform.write((performance.now() / 1000) * 0.4);
  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

export const controls = defineControls({
  'Mip level (1 = max)': {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      lodUniform.write(value * (mipLevelCount - 1));
    },
  },
  Density: {
    initial: 6,
    min: 0.5,
    max: 20,
    step: 0.5,
    onSliderChange: (value) => {
      densityUniform.write(value);
    },
  },
  'Checkerboard slice': {
    initial: checkerboardSlice,
    min: 0,
    max: depth - 1,
    step: 1,
    onSliderChange: (value) => {
      checkerboardSlice = value;
    },
  },
  'Write volume (direct)': {
    onButtonClick: writeVolumeDirect,
  },
  'Write volume (stretch)': {
    onButtonClick: writeVolumeStretch,
  },
  'Raw checkerboard': {
    onButtonClick: writeRawCheckerboardSlice,
  },
  'Clear all': {
    onButtonClick: () => texture.clear(),
  },
});

export function onCleanup() {
  root.destroy();
}

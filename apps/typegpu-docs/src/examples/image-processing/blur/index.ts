// Original implementation:
// https://webgpu.github.io/webgpu-samples/?sample=imageBlur

import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const response = await fetch('/TypeGPU/plums.png');
const imageBitmap = await createImageBitmap(await response.blob());
const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];

const settings = {
  filterDim: 3,
  iterations: 1,
  get blockDim() {
    return 128 - this.filterDim + 1;
  },
};

const Settings = d.struct({
  filterDim: d.i32,
  blockDim: d.u32,
});

const settingsUniform = root.createUniform(Settings);

const imageTexture = root
  .createTexture({
    size: [srcWidth, srcHeight],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
imageTexture.write(imageBitmap);

const textures = [0, 1].map(() => {
  return root
    .createTexture({
      size: [srcWidth, srcHeight],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'storage');
});
const renderView = textures[1].createView(d.texture2d(d.f32));

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const ioLayout = tgpu.bindGroupLayout({
  flip: { uniform: d.u32 },
  premultiplyAlpha: { uniform: d.u32 },
  inTexture: { texture: d.texture2d(d.f32) },
  outTexture: { storageTexture: d.textureStorage2d('rgba8unorm') },
});

const tileData = tgpu.workgroupVar(d.arrayOf(d.arrayOf(d.vec4f, 128), 4));

const computeFn = tgpu.computeFn({
  in: {
    wid: d.builtin.workgroupId,
    lid: d.builtin.localInvocationId,
  },
  workgroupSize: [32, 1, 1],
})(({ wid, lid }) => {
  'use gpu';
  const settings = settingsUniform.$;
  const filterOffset = d.i32((settings.filterDim - 1) / 2);
  const dims = d.vec2i(std.textureDimensions(ioLayout.$.inTexture));
  const baseIndex =
    d.vec2i(wid.xy * d.vec2u(settings.blockDim, 4) + lid.xy * d.vec2u(4, 1)) -
    d.vec2i(filterOffset, 0);

  // Load a tile of pixels into shared memory
  for (const r of tgpu.unroll(std.range(4))) {
    for (const c of tgpu.unroll(std.range(4))) {
      let loadIndex = baseIndex + d.vec2i(c, r);
      if (ioLayout.$.flip !== 0) {
        loadIndex = loadIndex.yx;
      }

      const sample = std.textureSampleLevel(
        ioLayout.$.inTexture,
        sampler.$,
        d.vec2f((d.vec2f(loadIndex) + d.vec2f(0.5)) / d.vec2f(dims)),
        0,
      );
      tileData.$[r][lid.x * 4 + d.u32(c)] =
        ioLayout.$.premultiplyAlpha !== 0
          ? d.vec4f(sample.rgb * sample.a, sample.a)
          : d.vec4f(sample);
    }
  }

  std.workgroupBarrier();

  // Apply the horizontal blur filter and write to the output texture
  for (const r of tgpu.unroll(std.range(4))) {
    for (const c of tgpu.unroll(std.range(4))) {
      let writeIndex = baseIndex + d.vec2i(c, r);
      if (ioLayout.$.flip !== 0) {
        writeIndex = writeIndex.yx;
      }

      const center = d.i32(4 * lid.x) + c;
      if (
        center >= filterOffset &&
        center < 128 - filterOffset &&
        std.all(std.lt(writeIndex, dims))
      ) {
        let acc = d.vec4f();
        for (let f = 0; f < settings.filterDim; f++) {
          const i = center + f - filterOffset;
          acc += tileData.$[r][i] / settings.filterDim;
        }
        std.textureStore(ioLayout.$.outTexture, writeIndex, acc);
      }
    }
  }
});

const renderFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  return std.textureSample(renderView.$, sampler.$, input.uv);
});

const zeroBuffer = root.createBuffer(d.u32, 0).$usage('uniform');
const oneBuffer = root.createBuffer(d.u32, 1).$usage('uniform');

const ioBindGroups = [
  root.createBindGroup(ioLayout, {
    flip: zeroBuffer,
    premultiplyAlpha: oneBuffer,
    inTexture: imageTexture,
    outTexture: textures[0],
  }),
  root.createBindGroup(ioLayout, {
    flip: oneBuffer,
    premultiplyAlpha: zeroBuffer,
    inTexture: textures[0],
    outTexture: textures[1],
  }),
  root.createBindGroup(ioLayout, {
    flip: zeroBuffer,
    premultiplyAlpha: zeroBuffer,
    inTexture: textures[1],
    outTexture: textures[0],
  }),
];

const computePipeline = root.createComputePipeline({ compute: computeFn });

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: renderFragment,
});

function render() {
  settingsUniform.write({
    filterDim: settings.filterDim,
    blockDim: settings.blockDim,
  });

  const indices = [
    0,
    1,
    ...Array(settings.iterations - 1)
      .fill([2, 1])
      .flat(),
  ];

  for (const i of indices) {
    computePipeline
      .with(ioBindGroups[i])
      .dispatchWorkgroups(Math.ceil(srcWidth / settings.blockDim), Math.ceil(srcHeight / 4));
  }

  renderPipeline.withColorAttachment({ view: context }).draw(3);
}
render();

// #region Example controls & Cleanup

export const controls = defineControls({
  'filter size': {
    initial: 3,
    min: 3,
    max: 41,
    step: 2,
    onSliderChange(newValue) {
      settings.filterDim = newValue;
      render();
    },
  },

  iterations: {
    initial: 1,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange(newValue) {
      settings.iterations = newValue;
      render();
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion

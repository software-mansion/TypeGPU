// Original implementation:
// https://webgpu.github.io/webgpu-samples/?sample=imageBlur

// -- Hooks into the example environment
import { addSliderPlumParameter } from '@typegpu/example-toolkit';
// --
import {
  arrayOf,
  f32,
  i32,
  struct,
  u32,
  vec2f,
  vec3f,
  type vec4f,
} from 'typegpu/data';
import tgpu, {
  type SampledTextureParams,
  type StorageTextureParams,
  type TgpuTexture,
  type TgpuTextureView,
  asUniform,
  builtin,
  wgsl,
} from 'typegpu/experimental';

const tileDim = 128;
const batch = [4, 4];

const filterSize = addSliderPlumParameter('filter size', 2, {
  min: 2,
  max: 40,
  step: 2,
});
const iterations = addSliderPlumParameter('iterations', 1, {
  min: 1,
  max: 10,
  step: 1,
});
const settingsPlum = wgsl.plum((get) => ({
  blockDim: tileDim - (get(filterSize) - 1),
  filterDim: get(filterSize),
}));

const root = await tgpu.init();

const blurParamsBuffer = root
  .createBuffer(
    struct({
      filterDim: i32,
      blockDim: u32,
    }),
    settingsPlum,
  )
  .$name('BlurParams')
  .$usage('uniform');
const params = asUniform(blurParamsBuffer);

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const response = await fetch('/TypeGPU/plums.jpg');
const imageBitmap = await createImageBitmap(await response.blob());

const inParams: SampledTextureParams = {
  type: 'texture_2d',
  dataType: f32,
};
const outParams: StorageTextureParams = {
  type: 'texture_storage_2d',
  access: 'write',
};

const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
const imageTexture = wgsl
  .texture({
    size: [srcWidth, srcHeight, 1],
    format: 'rgba8unorm',
  })
  .$allowSampled();

root.device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.textureFor(imageTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const textures = [0, 1].map(() => {
  return wgsl
    .texture({
      size: [srcWidth, srcHeight, 1],
      format: 'rgba8unorm',
    })
    .$allowSampled()
    .$allowStorage();
});

const flipSlot = wgsl.slot<number>();
const inTextureSlot = wgsl.slot<TgpuTextureView<typeof f32, 'sampled'>>();
const outTextureSlot = wgsl.slot<TgpuTextureView<typeof vec4f, 'storage'>>();

const tileVar = wgsl.var(
  arrayOf(arrayOf(vec3f, 128), 4),
  undefined,
  'workgroup',
);

type inTextureType =
  | TgpuTexture<'sampled'>
  | TgpuTexture<'sampled' | 'storage'>;
type outTextureType =
  | TgpuTexture<'storage'>
  | TgpuTexture<'sampled' | 'storage'>;

function makeComputePipeline(
  inTexture: inTextureType,
  outTexture: outTextureType,
  flip: number,
) {
  return root.makeComputePipeline({
    workgroupSize: [32],
    code: wgsl`
      let filterOffset = (${params}.filterDim - 1) / 2;
      let dims = vec2i(textureDimensions(${inTextureSlot}, 0));
      let baseIndex = vec2i(${builtin.workgroupId}.xy * vec2(${params}.blockDim, 4) +
                                ${builtin.localInvocationId}.xy * vec2(4, 1))
                      - vec2(filterOffset, 0);

      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          var loadIndex = baseIndex + vec2(c, r);
          if (${flipSlot} != 0) {
            loadIndex = loadIndex.yx;
          }

          ${tileVar}[r][4 * ${builtin.localInvocationId}.x + u32(c)] = textureSampleLevel(
            ${inTextureSlot},
            ${sampler},
            (vec2f(loadIndex) + vec2f(0.25, 0.25)) / vec2f(dims),
            0.0
          ).rgb;
        }
      }

      workgroupBarrier();

      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          var writeIndex = baseIndex + vec2(c, r);
          if (${flipSlot} != 0) {
            writeIndex = writeIndex.yx;
          }

          let center = i32(4 * ${builtin.localInvocationId}.x) + c;
          if (center >= filterOffset &&
              center < 128 - filterOffset &&
              all(writeIndex < dims)) {
            var acc = vec3(0.0, 0.0, 0.0);
            for (var f = 0; f < ${params}.filterDim; f++) {
              var i = center + f - filterOffset;
              acc = acc + (1.0 / f32(${params}.filterDim)) * ${tileVar}[r][i];
            }
            textureStore(${outTextureSlot}, writeIndex, vec4(acc, 1.0));
          }
        }
      }
    `
      .with(inTextureSlot, inTexture.asSampled(inParams))
      .with(outTextureSlot, outTexture.asStorage(outParams))
      .with(flipSlot, flip),
  });
}

const inputs: [inTextureType, outTextureType, number][] = [
  [imageTexture, textures[0], 0],
  [textures[0], textures[1], 1],
  [textures[1], textures[0], 0],
];

const computePipelines = inputs.map(([inTexture, outTexture, flip]) =>
  makeComputePipeline(inTexture, outTexture, flip),
);

const blurVertexWGSL = wgsl`
  const pos = array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  );

  const uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  );

  let Position = vec4(pos[${builtin.vertexIndex}], 0.0, 1.0);
  let fragUV = uv[${builtin.vertexIndex}];
`;

const blurFragmentWGSL = wgsl`
  return textureSample(${textures[1].asSampled(inParams)}, ${sampler}, fragUV);
`;

const renderPipeline = root.makeRenderPipeline({
  vertex: {
    code: blurVertexWGSL,
    output: {
      [builtin.position.s]: 'Position',
      fragUV: vec2f,
    },
  },
  fragment: {
    code: blurFragmentWGSL,
    target: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

const render = () => {
  computePipelines[0].execute({
    workgroups: [
      Math.ceil(srcWidth / root.readPlum(settingsPlum).blockDim),
      Math.ceil(srcHeight / batch[1]),
    ],
  });
  computePipelines[1].execute({
    workgroups: [
      Math.ceil(srcWidth / root.readPlum(settingsPlum).blockDim),
      Math.ceil(srcHeight / batch[1]),
    ],
  });
  for (let i = 0; i < root.readPlum(iterations) - 1; i++) {
    computePipelines[2].execute({
      workgroups: [
        Math.ceil(srcWidth / root.readPlum(settingsPlum).blockDim),
        Math.ceil(srcHeight / batch[1]),
      ],
    });
    computePipelines[1].execute({
      workgroups: [
        Math.ceil(srcWidth / root.readPlum(settingsPlum).blockDim),
        Math.ceil(srcHeight / batch[1]),
      ],
    });
  }

  renderPipeline.execute({
    vertexCount: 6,
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  root.flush();
};

render();

root.onPlumChange(filterSize, () => render());
root.onPlumChange(iterations, () => render());

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}

/*
{
  "title": "Image Blur",
  "category": "image-processing"
}
*/

// -- Hooks into the example environment
import {
  addElement,
  addParameter,
  onCleanup,
  onFrame,
} from '@wigsill/example-toolkit';
// --
import wgsl, { builtin, WgslTextureView } from 'wigsill';
import { createRuntime } from 'wigsill/web';
import { arrayOf, f32, i32, struct, u32, vec2f, vec3f } from 'wigsill/data';

const tileDim = 128;
const batch = [4, 4];

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const runtime = await createRuntime();
const device = runtime.device;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const response = await fetch('/favicon.png');
const imageBitmap = await createImageBitmap(await response.blob());

const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
const imageTexture = wgsl.texture(
  {
    size: [srcWidth, srcHeight, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  },
  'texture_2d',
  f32,
);

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: runtime.textureFor(imageTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const textures = [0, 1].map(() => {
  return wgsl.texture(
    {
      size: [srcWidth, srcHeight, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.STORAGE_BINDING,
    },
    'texture_storage_2d',
    'write',
  );
});

const blurParamsBuffer = wgsl
  .buffer(
    struct({
      filterDim: i32,
      blockDim: u32,
    }),
  )
  .$name('BlurParams')
  .$allowUniform();
const params = blurParamsBuffer.asUniform();

const flipSlot = wgsl.slot<number>();
const inTextureSlot = wgsl.slot<WgslTextureView>();
const outTextureSlot = wgsl.slot<WgslTextureView>();

const tileVar = wgsl.var(
  arrayOf(arrayOf(vec3f, 128), 4),
  undefined,
  'workgroup',
);

const mainComputeFun = wgsl.fn()`(wid: vec3u, lid: vec3u) {
  let filterOffset = (${params}.filterDim - 1) / 2;
  let dims = vec2i(textureDimensions(${inTextureSlot}, 0));
  let baseIndex = vec2i(wid.xy * vec2(${params}.blockDim, 4) +
                            lid.xy * vec2(4, 1))
                  - vec2(filterOffset, 0);

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var loadIndex = baseIndex + vec2(c, r);
      if (${flipSlot} != 0u) {
        loadIndex = loadIndex.yx;
      }

      ${tileVar}[r][4 * lid.x + u32(c)] = textureSampleLevel(
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

      let center = i32(4 * lid.x) + c;
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
  }
`;

function makeComputePipeline(
  inTexture: WgslTextureView,
  outTexture: WgslTextureView,
  flip: number,
) {
  return runtime.makeComputePipeline({
    workgroupSize: [32],
    code: wgsl`
      ${mainComputeFun
        .with(inTextureSlot, inTexture)
        .with(outTextureSlot, outTexture)
        .with(flipSlot, flip)}
        (${builtin.globalInvocationId}, ${builtin.localInvocationId});
    `,
  });
}

const inputs: [WgslTextureView, WgslTextureView, number][] = [
  [imageTexture.createView(), textures[0].createView(), 0],
  [textures[0].createView(), textures[1].createView(), 1],
  [textures[1].createView(), textures[0].createView(), 0],
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
}
`;

const blurFragmentWGSL = wgsl`
  return textureSample(${textures[1].createView()}, ${sampler}, fragUV);
`;

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    code: blurVertexWGSL,
    output: {
      [builtin.position]: 'Position',
      fragUV: [vec2f, 'fragUV'],
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

const settings = {
  filterSize: 15,
  iterations: 2,
};

let blockDim: number;

const updateSettings = () => {
  blockDim = tileDim - (settings.filterSize - 1);
  runtime.writeBuffer(blurParamsBuffer, {
    filterDim: settings.filterSize,
    blockDim,
  });
};

updateSettings();

onFrame(() => {
  computePipelines[0].execute([
    Math.ceil(srcWidth / blockDim),
    Math.ceil(srcHeight / batch[1]),
  ]);
  computePipelines[1].execute([
    Math.ceil(srcWidth / blockDim),
    Math.ceil(srcHeight / batch[1]),
  ]);
  for (let i = 0; i < settings.iterations - 1; i++) {
    computePipelines[2].execute([
      Math.ceil(srcWidth / blockDim),
      Math.ceil(srcHeight / batch[1]),
    ]);
    computePipelines[1].execute([
      Math.ceil(srcWidth / blockDim),
      Math.ceil(srcHeight / batch[1]),
    ]);
  }

  runtime.flush();

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

  runtime.flush();
});

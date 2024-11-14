// Original implementation:
// https://webgpu.github.io/webgpu-samples/?sample=imageBlur

import { i32, struct, u32 } from 'typegpu/data';
import tgpu from 'typegpu/experimental';

const tileDim = 128;
const batch = [4, 4];

const Settings = struct({
  filterDim: i32,
  blockDim: u32,
});

const uniformLayout = tgpu.bindGroupLayout({
  settings: { uniform: Settings },
  sampling: { sampler: 'filtering' },
});

const ioLayout = tgpu.bindGroupLayout({
  flip: { uniform: u32 },
  inTexture: { texture: 'float' },
  outTexture: { storageTexture: 'rgba8unorm' },
});

const renderLayout = tgpu.bindGroupLayout({
  texture: { texture: 'float' },
  sampling: { sampler: 'filtering' },
});

const computeShaderCode = /* wgsl */ `

struct Settings {
  filterDim: i32,
  blockDim: u32,
}

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var sampling: sampler;

@group(1) @binding(0) var<uniform> flip: u32;
@group(1) @binding(1) var inTexture: texture_2d<f32>;
@group(1) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

var<workgroup> tile: array<array<vec3f, 128>, 4>;

@compute @workgroup_size(32, 1)
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let filterOffset = (settings.filterDim - 1) / 2;
  let dims = vec2i(textureDimensions(inTexture, 0));
  let baseIndex = vec2i(wid.xy * vec2(settings.blockDim, 4) +
                            lid.xy * vec2(4, 1))
                  - vec2(filterOffset, 0);

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var loadIndex = baseIndex + vec2(c, r);
      if (flip != 0) {
        loadIndex = loadIndex.yx;
      }

      tile[r][4 * lid.x + u32(c)] = textureSampleLevel(
        inTexture,
        sampling,
        (vec2f(loadIndex) + vec2f(0.25, 0.25)) / vec2f(dims),
        0.0
      ).rgb;
    }
  }

  workgroupBarrier();

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var writeIndex = baseIndex + vec2(c, r);
      if (flip != 0) {
        writeIndex = writeIndex.yx;
      }

      let center = i32(4 * lid.x) + c;
      if (center >= filterOffset &&
          center < 128 - filterOffset &&
          all(writeIndex < dims)) {
        var acc = vec3(0.0, 0.0, 0.0);
        for (var f = 0; f < settings.filterDim; f++) {
          var i = center + f - filterOffset;
          acc = acc + (1.0 / f32(settings.filterDim)) * tile[r][i];
        }
        textureStore(outTexture, writeIndex, vec4(acc, 1.0));
      }
    }
  }
}

`;

const renderShaderCode = /* wgsl */ `

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@group(0) @binding(0) var texture: texture_2d<f32>;
@group(0) @binding(1) var sampling: sampler;

@vertex
fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput {
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

  var output: VertexOutput;
  output.position = vec4(pos[index], 0.0, 1.0);
  output.uv = uv[index];
  return output;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(texture, sampling, uv);
}

`;

const root = await tgpu.init();
const device = root.device;

const settings = {
  filterDim: 2,
  iterations: 1,
  get blockDim() {
    return tileDim - (this.filterDim - 1);
  },
};

const settingsBuffer = root.createBuffer(Settings).$usage('uniform');

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const response = await fetch('/TypeGPU/plums.jpg');
const imageBitmap = await createImageBitmap(await response.blob());

const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
const imageTexture = root
  .createTexture({
    size: [srcWidth, srcHeight],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.unwrap(imageTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const textures = [0, 1].map(() => {
  return root
    .createTexture({
      size: [srcWidth, srcHeight],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'storage');
});

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const computePipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(uniformLayout), root.unwrap(ioLayout)],
  }),
  compute: {
    module: device.createShaderModule({ code: computeShaderCode }),
  },
});

const uniformBindGroup = uniformLayout.populate({
  settings: settingsBuffer,
  sampling: sampler,
});

const zeroBuffer = root.createBuffer(u32, 0).$usage('uniform');
const oneBuffer = root.createBuffer(u32, 1).$usage('uniform');

const ioBindGroups = [
  ioLayout.populate({
    flip: zeroBuffer,
    inTexture: imageTexture,
    outTexture: textures[0],
  }),
  ioLayout.populate({
    flip: oneBuffer,
    inTexture: textures[0],
    outTexture: textures[1],
  }),
  ioLayout.populate({
    flip: zeroBuffer,
    inTexture: textures[1],
    outTexture: textures[0],
  }),
];

const renderBindGroup = renderLayout.populate({
  texture: textures[1],
  sampling: sampler,
});

const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined as unknown as GPUTextureView,
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    },
  ],
};

const renderShaderModule = device.createShaderModule({
  code: renderShaderCode,
});

const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(renderLayout)],
  }),
  vertex: {
    module: renderShaderModule,
  },
  fragment: {
    module: renderShaderModule,
    targets: [{ format: presentationFormat }],
  },
});

function runCompute(encoder: GPUCommandEncoder, ioIndex: number) {
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, root.unwrap(uniformBindGroup));
  computePass.setBindGroup(1, root.unwrap(ioBindGroups[ioIndex]));
  computePass.dispatchWorkgroups(
    Math.ceil(srcWidth / settings.blockDim),
    Math.ceil(srcHeight / batch[1]),
  );
  computePass.end();
}

function render() {
  settingsBuffer.write({
    filterDim: settings.filterDim,
    blockDim: settings.blockDim,
  });

  const encoder = device.createCommandEncoder();

  runCompute(encoder, 0);
  runCompute(encoder, 1);

  for (let i = 0; i < settings.iterations - 1; i++) {
    runCompute(encoder, 2);
    runCompute(encoder, 1);
  }

  // Updating the target render texture
  (
    renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment]
  )[0].view = context.getCurrentTexture().createView();

  const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(renderPipeline);
  passEncoder.setBindGroup(0, root.unwrap(renderBindGroup));
  passEncoder.draw(6);
  passEncoder.end();

  device.queue.submit([encoder.finish()]);
}

render();

// #region Example Controls & Cleanup

export const controls = {
  'filter size': {
    initial: 2,
    min: 2,
    max: 40,
    step: 2,
    onSliderChange(newValue: number) {
      settings.filterDim = newValue;
      render();
    },
  },

  iterations: {
    initial: 1,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange(newValue: number) {
      settings.iterations = newValue;
      render();
    },
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}

// #endregion

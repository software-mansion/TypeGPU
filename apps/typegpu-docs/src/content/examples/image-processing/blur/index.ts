// Original implementation:
// https://webgpu.github.io/webgpu-samples/?sample=imageBlur

import { i32, struct, u32 } from 'typegpu/data';
import tgpu from 'typegpu/experimental';

const tileDim = 128;
const batch = [4, 4];

const Params = struct({
  filterDim: i32,
  blockDim: u32,
});

const uniformLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  u_sampler: { sampler: 'filtering' },
});

const ioLayout = tgpu.bindGroupLayout({
  flip: { uniform: u32 },
  in_texture: { texture: 'float' },
  out_texture: { storageTexture: 'rgba8unorm' },
});

const renderLayout = tgpu.bindGroupLayout({
  u_texture: { texture: 'float' },
  u_sampler: { sampler: 'filtering' },
});

const computeShaderCode = /* wgsl */ `

struct Params {
  filterDim: i32,
  blockDim: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var u_sampler: sampler;

@group(1) @binding(0) var<uniform> flip: u32;
@group(1) @binding(1) var in_texture: texture_2d<f32>;
@group(1) @binding(2) var out_texture: texture_storage_2d<rgba8unorm, write>;

var<workgroup> tile: array<array<vec3f, 128>, 4>;

@compute @workgroup_size(32, 1)
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let filterOffset = (params.filterDim - 1) / 2;
  let dims = vec2i(textureDimensions(in_texture, 0));
  let baseIndex = vec2i(wid.xy * vec2(params.blockDim, 4) +
                            lid.xy * vec2(4, 1))
                  - vec2(filterOffset, 0);

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var loadIndex = baseIndex + vec2(c, r);
      if (flip != 0) {
        loadIndex = loadIndex.yx;
      }

      tile[r][4 * lid.x + u32(c)] = textureSampleLevel(
        in_texture,
        u_sampler,
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
        for (var f = 0; f < params.filterDim; f++) {
          var i = center + f - filterOffset;
          acc = acc + (1.0 / f32(params.filterDim)) * tile[r][i];
        }
        textureStore(out_texture, writeIndex, vec4(acc, 1.0));
      }
    }
  }
}

`;

const renderShaderCode = /* wgsl */ `

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) frag_uv: vec2f,
};

@group(0) @binding(0) var u_texture: texture_2d<f32>;
@group(0) @binding(1) var u_sampler: sampler;

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
  output.frag_uv = uv[index];
  return output;
}

@fragment
fn main_frag(@location(0) frag_uv: vec2f) -> @location(0) vec4f {
  return textureSample(u_texture, u_sampler, frag_uv);
}

`;

const root = await tgpu.init();
const device = root.device;

const state = (() => {
  let filterDim = 2;
  let iterations = 1;

  return {
    get iterations() {
      return iterations;
    },
    set iterations(newValue: number) {
      iterations = newValue;
      render();
    },

    get filterDim() {
      return filterDim;
    },
    set filterDim(newValue: number) {
      filterDim = newValue;
      render();
    },

    // Derived state

    get blockDim() {
      return tileDim - (this.filterDim - 1);
    },
  };
})();

const blurParamsBuffer = root.createBuffer(Params).$usage('uniform');

function updateParams() {
  blurParamsBuffer.write({
    filterDim: state.filterDim,
    blockDim: state.blockDim,
  });
}

updateParams();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
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
  params: blurParamsBuffer,
  u_sampler: sampler,
});

const zeroBuffer = root.createBuffer(u32, 0).$usage('uniform');
const oneBuffer = root.createBuffer(u32, 1).$usage('uniform');

const ioBindGroups = [
  ioLayout.populate({
    flip: zeroBuffer,
    in_texture: imageTexture,
    out_texture: textures[0],
  }),
  ioLayout.populate({
    flip: oneBuffer,
    in_texture: textures[0],
    out_texture: textures[1],
  }),
  ioLayout.populate({
    flip: zeroBuffer,
    in_texture: textures[1],
    out_texture: textures[0],
  }),
];

const renderBindGroup = renderLayout.populate({
  u_texture: textures[1],
  u_sampler: sampler,
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
    Math.ceil(srcWidth / state.blockDim),
    Math.ceil(srcHeight / batch[1]),
  );
  computePass.end();
}

function render() {
  updateParams();

  const encoder = root.device.createCommandEncoder();

  runCompute(encoder, 0);
  runCompute(encoder, 1);

  for (let i = 0; i < state.iterations - 1; i++) {
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

  root.device.queue.submit([encoder.finish()]);
}

render();

// #region Example Controls

export const controls = {
  'filter size': {
    initial: 2,
    min: 2,
    max: 40,
    step: 2,
    onSliderChange(newValue: number) {
      state.filterDim = newValue;
    },
  },

  iterations: {
    initial: 1,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange(newValue: number) {
      state.iterations = newValue;
    },
  },
};

// #endregion

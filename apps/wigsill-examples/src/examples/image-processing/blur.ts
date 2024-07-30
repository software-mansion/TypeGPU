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
import wgsl, { builtin } from 'wigsill';
import { createRuntime } from 'wigsill/web';
import { f32 } from 'wigsill/data';

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

const blurWGSL = wgsl`
  let filterOffset = (params.filterDim - 1) / 2;
  let dims = vec2i(textureDimensions(inputTex, 0));
  let baseIndex = vec2i(${builtin.workgroupId}.xy * vec2(params.blockDim, 4) +
                            ${builtin.localInvocationId}.xy * vec2(4, 1))
                  - vec2(filterOffset, 0);

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var loadIndex = baseIndex + vec2(c, r);
      if (flip.value != 0u) {
        loadIndex = loadIndex.yx;
      }

      tile[r][4 * ${builtin.localInvocationId}.x + u32(c)] = textureSampleLevel(
        inputTex,
        samp,
        (vec2f(loadIndex) + vec2f(0.25, 0.25)) / vec2f(dims),
        0.0
      ).rgb;
    }
  }

  workgroupBarrier();

  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      var writeIndex = baseIndex + vec2(c, r);
      if (flip.value != 0) {
        writeIndex = writeIndex.yx;
      }

      let center = i32(4 * ${builtin.localInvocationId}.x) + c;
      if (center >= filterOffset &&
          center < 128 - filterOffset &&
          all(writeIndex < dims)) {
        var acc = vec3(0.0, 0.0, 0.0);
        for (var f = 0; f < params.filterDim; f++) {
          var i = center + f - filterOffset;
          acc = acc + (1.0 / f32(params.filterDim)) * tile[r][i];
        }
        textureStore(outputTex, writeIndex, vec4(acc, 1.0));
      }
    }
  }
}
`;

const fullscreenQuadPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({
      code: fullscreenTexturedQuadWGSL,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      code: fullscreenTexturedQuadWGSL,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const response = await fetch('../../assets/favicon.png');
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
  f32,
  'texture_2d',
);

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: runtime.textureFor(imageTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const textures = [0, 1].map(() => {
  return device.createTexture({
    size: {
      width: srcWidth,
      height: srcHeight,
    },
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING,
  });
});

const buffer0 = (() => {
  const buffer = device.createBuffer({
    size: 4,
    mappedAtCreation: true,
    usage: GPUBufferUsage.UNIFORM,
  });
  new Uint32Array(buffer.getMappedRange())[0] = 0;
  buffer.unmap();
  return buffer;
})();

const buffer1 = (() => {
  const buffer = device.createBuffer({
    size: 4,
    mappedAtCreation: true,
    usage: GPUBufferUsage.UNIFORM,
  });
  new Uint32Array(buffer.getMappedRange())[0] = 1;
  buffer.unmap();
  return buffer;
})();

const blurParamsBuffer = device.createBuffer({
  size: 8,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

const computeConstants = device.createBindGroup({
  layout: blurPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: sampler,
    },
    {
      binding: 1,
      resource: {
        buffer: blurParamsBuffer,
      },
    },
  ],
});

const computeBindGroup0 = device.createBindGroup({
  layout: blurPipeline.getBindGroupLayout(1),
  entries: [
    {
      binding: 1,
      resource: cubeTexture.createView(),
    },
    {
      binding: 2,
      resource: textures[0].createView(),
    },
    {
      binding: 3,
      resource: {
        buffer: buffer0,
      },
    },
  ],
});

const computeBindGroup1 = device.createBindGroup({
  layout: blurPipeline.getBindGroupLayout(1),
  entries: [
    {
      binding: 1,
      resource: textures[0].createView(),
    },
    {
      binding: 2,
      resource: textures[1].createView(),
    },
    {
      binding: 3,
      resource: {
        buffer: buffer1,
      },
    },
  ],
});

const computeBindGroup2 = device.createBindGroup({
  layout: blurPipeline.getBindGroupLayout(1),
  entries: [
    {
      binding: 1,
      resource: textures[1].createView(),
    },
    {
      binding: 2,
      resource: textures[0].createView(),
    },
    {
      binding: 3,
      resource: {
        buffer: buffer0,
      },
    },
  ],
});

const showResultBindGroup = device.createBindGroup({
  layout: fullscreenQuadPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: sampler,
    },
    {
      binding: 1,
      resource: textures[1].createView(),
    },
  ],
});

const settings = {
  filterSize: 15,
  iterations: 2,
};

let blockDim: number;
const updateSettings = () => {
  blockDim = tileDim - (settings.filterSize - 1);
  device.queue.writeBuffer(
    blurParamsBuffer,
    0,
    new Uint32Array([settings.filterSize, blockDim]),
  );
};
const gui = new GUI();
gui.add(settings, 'filterSize', 1, 33).step(2).onChange(updateSettings);
gui.add(settings, 'iterations', 1, 10).step(1);

updateSettings();

function frame() {
  const commandEncoder = device.createCommandEncoder();

  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(blurPipeline);
  computePass.setBindGroup(0, computeConstants);

  computePass.setBindGroup(1, computeBindGroup0);
  computePass.dispatchWorkgroups(
    Math.ceil(srcWidth / blockDim),
    Math.ceil(srcHeight / batch[1]),
  );

  computePass.setBindGroup(1, computeBindGroup1);
  computePass.dispatchWorkgroups(
    Math.ceil(srcHeight / blockDim),
    Math.ceil(srcWidth / batch[1]),
  );

  for (let i = 0; i < settings.iterations - 1; ++i) {
    computePass.setBindGroup(1, computeBindGroup2);
    computePass.dispatchWorkgroups(
      Math.ceil(srcWidth / blockDim),
      Math.ceil(srcHeight / batch[1]),
    );

    computePass.setBindGroup(1, computeBindGroup1);
    computePass.dispatchWorkgroups(
      Math.ceil(srcHeight / blockDim),
      Math.ceil(srcWidth / batch[1]),
    );
  }

  computePass.end();

  const passEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  passEncoder.setPipeline(fullscreenQuadPipeline);
  passEncoder.setBindGroup(0, showResultBindGroup);
  passEncoder.draw(6);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

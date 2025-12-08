import tgpu, { type TgpuBindGroup, type TgpuTextureView } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { castAndMerge } from './common';
import { exposure, gammaSRGB, tonemapACES } from './image';

const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let workTextures: (TgpuTextureView<d.WgslTexture2d<d.F32>>)[];
const bindGroupLayout = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
  iChannel1: { texture: d.texture2d() },
});
let bindGroups: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
  iChannel1: { texture: d.WgslTexture2d<d.F32> };
}>[];

function recreateResources() {
  workTextures = [0, 1, 2, 3].map(() =>
    root['~unstable'].createTexture({
      size: [canvas.width, canvas.height],
      format: 'rgba8unorm',
      dimension: '2d',
    }).$usage('sampled', 'render', 'storage').createView()
  );
  bindGroups = [
    root.createBindGroup(bindGroupLayout, {
      iChannel0: workTextures[2],
      iChannel1: workTextures[0], // irrelevant
    }),
    root.createBindGroup(bindGroupLayout, {
      iChannel0: workTextures[0],
      iChannel1: workTextures[0], // irrelevant
    }),
    root.createBindGroup(bindGroupLayout, {
      iChannel0: workTextures[1],
      iChannel1: workTextures[0], // irrelevant
    }),
    root.createBindGroup(bindGroupLayout, {
      iChannel0: workTextures[2],
      iChannel1: workTextures[3],
    }),
    root.createBindGroup(bindGroupLayout, {
      iChannel0: workTextures[3],
      iChannel1: workTextures[0], // irrelevant
    }),
  ];
}
recreateResources();

let iFrame = 0;
const iFrameUniform = root.createUniform(d.u32);
const iTimeBuffer = root.createUniform(d.u32);
const iResolutionBuffer = root.createUniform(d.vec3f);

function draw(timestamp: number) {
  iFrameUniform.write(iFrame);
  iFrame += 1;
  iTimeBuffer.write(timestamp);
  iResolutionBuffer.write(d.vec3f(canvas.width, canvas.height, 1));

  const fragmentFnABC = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(
    ({ uv }) => {
      if (iFrameUniform.$ % 2 === 0) {
        return castAndMerge(
          bindGroupLayout.$.iChannel0,
          5,
          uv,
          iResolutionBuffer.$.xy,
          iTimeBuffer.$,
        );
      }
      return castAndMerge(
        bindGroupLayout.$.iChannel0,
        2,
        uv,
        iResolutionBuffer.$.xy,
        iTimeBuffer.$,
      );
    },
  );

  const pipelineABC = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnABC, { format: 'bgra8unorm' })
    .createPipeline();

  pipelineABC
    .with(bindGroups[0])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[2],
    })
    .draw(3);

  pipelineABC
    .with(bindGroups[1])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[0],
    })
    .draw(3);

  pipelineABC
    .with(bindGroups[2])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[1],
    })
    .draw(3);

  const fragmentFnD = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(
    ({ uv }) => {
      if (iFrameUniform.$ % 2 === 0) {
        return std.textureLoad(bindGroupLayout.$.iChannel0, d.vec2i(uv), 0);
      }
      return std.textureLoad(bindGroupLayout.$.iChannel1, d.vec2i(uv), 0);
    },
  );

  const pipelineD = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnD, { format: 'bgra8unorm' })
    .createPipeline();

  pipelineD
    .with(bindGroups[3])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[1],
    })
    .draw(3);

  const fragmentFnImage = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    let luminance =
      std.textureLoad(bindGroupLayout.$.iChannel0, d.vec2i(uv), 0).xyz;
    luminance = luminance.mul(std.exp2(exposure));
    luminance = tonemapACES(luminance);
    luminance = gammaSRGB(luminance);
    return d.vec4f(luminance, 1.0);
  });

  const pipelineImage = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnImage, { format: 'bgra8unorm' })
    .createPipeline();

  pipelineImage
    .with(bindGroups[4])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView(),
    })
    .draw(3);

  lastFrameId = requestAnimationFrame(draw);
}
let lastFrameId = requestAnimationFrame(draw);

// #region Example controls and cleanup

export function onCleanup() {
  cancelAnimationFrame(lastFrameId);
  root.destroy();
}

// #endregion

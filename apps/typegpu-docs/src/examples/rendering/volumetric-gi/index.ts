import tgpu, {
  type RenderFlag,
  type SampledFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { castAndMerge } from './common.ts';
import { exposure, gammaSRGB, tonemapACES } from './image.ts';

const root = await tgpu.init();
const presentationFormat = 'bgra8unorm' as const; //navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let workTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: typeof presentationFormat;
  }>
  & RenderFlag
  & SampledFlag
)[];
const bindGroupLayoutABC = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});
let bindGroupsABC: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>[];

const bindGroupLayoutD = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
  iChannel1: { texture: d.texture2d() },
});
let bindGroupD: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
  iChannel1: { texture: d.WgslTexture2d<d.F32> };
}>;

const bindGroupLayoutImage = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});
let bindGroupImage: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>;

function recreateResources() {
  // A, B, C, D1, D2 (D writes to D, so we copy it each time)
  workTextures = [0, 1, 2, 3, 4].map((i) =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat,
        dimension: '2d',
      })
      .$usage('sampled', 'render')
      .$name(`work texture ${i}`)
  );
  bindGroupsABC = [
    root.createBindGroup(bindGroupLayoutABC, { iChannel0: workTextures[2] }),
    root.createBindGroup(bindGroupLayoutABC, { iChannel0: workTextures[0] }),
    root.createBindGroup(bindGroupLayoutABC, { iChannel0: workTextures[1] }),
  ];
  bindGroupD = root.createBindGroup(bindGroupLayoutD, {
    iChannel0: workTextures[2],
    iChannel1: workTextures[3],
  });
  bindGroupImage = root.createBindGroup(bindGroupLayoutImage, {
    iChannel0: workTextures[3],
  });
}
recreateResources();

let iFrame = 0;
const iFrameUniform = root.createUniform(d.u32);
const iTimeBuffer = root.createUniform(d.f32);
const iResolutionBuffer = root.createUniform(d.vec3f);

function draw(timestamp: number) {
  iFrameUniform.write(iFrame);
  iFrame += 1;
  iTimeBuffer.write(timestamp / 1000);
  iResolutionBuffer.write(d.vec3f(canvas.width, canvas.height, 1));

  const cascadeIndexBuffer = root.createUniform(d.vec2i);

  const fragmentFnABC = tgpu['~unstable'].fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })(
    ({ pos }) => {
      if (iFrameUniform.$ % 2 === 0) {
        return castAndMerge(
          bindGroupLayoutABC.$.iChannel0,
          cascadeIndexBuffer.$.x,
          pos.xy,
          iResolutionBuffer.$.xy,
          iTimeBuffer.$,
        );
      }
      return castAndMerge(
        bindGroupLayoutABC.$.iChannel0,
        cascadeIndexBuffer.$.y,
        pos.xy,
        iResolutionBuffer.$.xy,
        iTimeBuffer.$,
      );
    },
  );

  const pipelineABC = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnABC, { format: presentationFormat })
    .createPipeline();

  cascadeIndexBuffer.write(d.vec2i(5, 2));
  pipelineABC
    .with(bindGroupsABC[0])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[0],
    })
    .draw(3);

  cascadeIndexBuffer.write(d.vec2i(4, 1));
  pipelineABC
    .with(bindGroupsABC[1])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[1],
    })
    .draw(3);

  cascadeIndexBuffer.write(d.vec2i(3, 0));
  pipelineABC
    .with(bindGroupsABC[2])
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[2],
    })
    .draw(3);

  const fragmentFnD = tgpu['~unstable'].fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })(
    ({ pos }) => {
      if (iFrameUniform.$ % 2 === 0) {
        return std.textureLoad(
          bindGroupLayoutD.$.iChannel1,
          d.vec2i(pos.xy),
          0,
        );
      }
      return std.textureLoad(bindGroupLayoutD.$.iChannel0, d.vec2i(pos.xy), 0);
    },
  );

  const pipelineD = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnD, { format: presentationFormat })
    .createPipeline();

  pipelineD
    .with(bindGroupD)
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[4],
    })
    .draw(3);

  workTextures[3].copyFrom(workTextures[4]);

  const fragmentFnImage = tgpu['~unstable'].fragmentFn({
    in: { pos: d.builtin.position },
    out: d.vec4f,
  })(({ pos }) => {
    let luminance =
      std.textureLoad(bindGroupLayoutImage.$.iChannel0, d.vec2i(pos.xy), 0).xyz;
    luminance = luminance.mul(std.exp2(exposure));
    luminance = tonemapACES(luminance);
    luminance = gammaSRGB(luminance);
    return d.vec4f(luminance, 1.0);
  });

  const pipelineImage = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFnImage, { format: presentationFormat })
    .createPipeline();

  pipelineImage
    .with(bindGroupImage)
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

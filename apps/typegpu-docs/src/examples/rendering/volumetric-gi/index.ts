import tgpu, {
  type RenderFlag,
  type SampledFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { exposure, gammaSRGB, tonemapACES } from './image.ts';
import { canvas, context, presentationFormat, root } from './root.ts';
import {
  bindGroupLayoutABC,
  cascadeIndexBuffer,
  iFrameUniform,
  iResolutionBuffer,
  iTimeBuffer,
  pipelineABC,
} from './pipelines.ts';

let workTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: typeof presentationFormat;
  }>
  & RenderFlag
  & SampledFlag
)[];
let bindGroupsABC: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>;

const bindGroupLayoutImage = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});
let bindGroupImage: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>;

function recreateResources() {
  workTextures = [0, 1].map((i) =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat,
        dimension: '2d',
      })
      .$usage('sampled', 'render')
      .$name(`work texture ${i}`)
  );
  bindGroupsABC = root.createBindGroup(bindGroupLayoutABC, {
    iChannel0: workTextures[0],
  });
  bindGroupImage = root.createBindGroup(bindGroupLayoutImage, {
    iChannel0: workTextures[0],
  });
}
recreateResources();

const resizeObserver = new ResizeObserver(recreateResources);
resizeObserver.observe(canvas);

let iFrame = 0;

function draw(timestamp: number) {
  iFrameUniform.write(iFrame);
  iFrame += 1;
  iTimeBuffer.write(timestamp / 1000);
  iResolutionBuffer.write(d.vec3f(canvas.width, canvas.height, 1));

  for (let i = 5; i >= 0; i--) {
    const bindGroup = root.createBindGroup(bindGroupLayoutABC, {
      iChannel0: workTextures[0],
    });

    cascadeIndexBuffer.write(i);
    pipelineABC
      .with(bindGroup)
      .withColorAttachment({
        loadOp: 'clear',
        storeOp: 'store',
        view: workTextures[1],
      })
      .draw(3);

    workTextures[0].copyFrom(workTextures[1]);
  }

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
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion

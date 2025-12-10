import type {
  RenderFlag,
  SampledFlag,
  TgpuBindGroup,
  TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import { canvas, context, presentationFormat, root } from './root.ts';
import {
  bindGroupLayoutABC,
  bindGroupLayoutImage,
  cascadeIndexBuffer,
  iFrameUniform,
  iResolutionBuffer,
  iTimeBuffer,
  pipelineABC,
  pipelineImage,
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

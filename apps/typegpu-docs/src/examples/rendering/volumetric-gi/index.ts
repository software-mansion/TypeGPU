import type {
  RenderFlag,
  SampledFlag,
  TgpuBindGroup,
  TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import {
  canvas,
  context,
  intermediateFormat,
  type presentationFormat,
  root,
} from './root.ts';
import {
  bilinearFix,
  cascadeIndexUniform,
  castAndMergeLayout,
  castAndMergePipeline,
  imageLayout,
  imagePipeline,
  luminancePostprocessing,
  resolutionUniform,
  timeUniform,
} from './pipelines.ts';

let workTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: typeof presentationFormat;
  }>
  & RenderFlag
  & SampledFlag
)[];
let castAndMergeBindGroup: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>;

let imageBindGroup: TgpuBindGroup<{
  iChannel0: { texture: d.WgslTexture2d<d.F32> };
}>;

function recreateResources() {
  workTextures = [0, 1].map((i) =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: intermediateFormat,
        dimension: '2d',
      })
      .$usage('sampled', 'render')
      .$name(`work texture ${i}`)
  );
  castAndMergeBindGroup = root.createBindGroup(castAndMergeLayout, {
    iChannel0: workTextures[0],
  });
  imageBindGroup = root.createBindGroup(imageLayout, {
    iChannel0: workTextures[0],
  });
}
recreateResources();

const resizeObserver = new ResizeObserver(recreateResources);
resizeObserver.observe(canvas);

function draw(timestamp: number) {
  timeUniform.write(timestamp / 1000);
  resolutionUniform.write(d.vec3f(canvas.width, canvas.height, 1));

  for (let i = 5; i >= 0; i--) {
    cascadeIndexUniform.write(i);
    castAndMergePipeline
      .with(castAndMergeBindGroup)
      .withColorAttachment({
        loadOp: 'clear',
        storeOp: 'store',
        view: workTextures[1],
      })
      .draw(3);

    workTextures[0].copyFrom(workTextures[1]);
  }

  imagePipeline
    .with(imageBindGroup)
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

export const controls = {
  'Bilinear fix': {
    initial: true,
    onToggleChange: (value: boolean) => {
      bilinearFix.write(Number(value));
    },
  },
  'Luminance postprocessing': {
    initial: true,
    onToggleChange: (value: boolean) => {
      luminancePostprocessing.write(Number(value));
    },
  },
};

// #endregion

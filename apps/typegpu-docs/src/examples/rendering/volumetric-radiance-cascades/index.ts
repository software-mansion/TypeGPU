import {
  type RenderFlag,
  type SampledFlag,
  tgpu,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import { castAndMerge, coordToWorldPos } from './castAndMerge.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { exposure, gammaSRGB, tonemapACES } from './image.ts';
import * as std from 'typegpu/std';
import { getSceneColor, scenes } from './scenes.ts';

// initial setup

export const root = await tgpu.init();
export const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
export const intermediateFormat = 'rgba16float';
export const canvas = document.querySelector('canvas') as HTMLCanvasElement;
export const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// buffers and params

const cascadeIndexUniform = root.createUniform(d.i32);
const timeUniform = root.createUniform(d.f32);
let quality = 0.35; // modifies the resolution of the work textures
const workResolutionUniform = root.createUniform(d.vec3f); // only for castAndMerge
const bilinearFixUniform = root.createUniform(d.u32, 1);
const luminancePostprocessingUniform = root.createUniform(d.u32, 1);
let cascadesNumber = 6;
const cascadesNumberUniform = root.createUniform(d.i32, cascadesNumber);
const selectedSceneUniform = root.createUniform(d.u32, scenes.Shadertoy);

// prerenderScene pipeline

const prerenderSceneFragment = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  const worldPos = coordToWorldPos(pos.xy, workResolutionUniform.$.xy);
  return getSceneColor(worldPos, timeUniform.$, selectedSceneUniform.$);
});

export const prerenderScenePipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(prerenderSceneFragment, { format: intermediateFormat })
  .createPipeline();

// castAndMerge pipeline

export const castAndMergeLayout = tgpu.bindGroupLayout({
  scene: { texture: d.texture2d() },
  iChannel0: { texture: d.texture2d() },
});

const castAndMergeFragment = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  return castAndMerge(
    castAndMergeLayout.$.scene,
    castAndMergeLayout.$.iChannel0,
    cascadeIndexUniform.$,
    pos.xy,
    workResolutionUniform.$.xy,
    bilinearFixUniform.$,
    cascadesNumberUniform.$,
  );
});

export const castAndMergePipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(castAndMergeFragment, { format: intermediateFormat })
  .createPipeline();

// image pipeline

export const imageLayout = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const imageFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let luminance = std.textureSample(imageLayout.$.iChannel0, sampler.$, uv).xyz;
  if (luminancePostprocessingUniform.$ === 1) {
    luminance = luminance.mul(std.exp2(exposure));
    luminance = tonemapACES(luminance);
    luminance = gammaSRGB(luminance);
  }
  return d.vec4f(luminance, 1.0);
});

export const imagePipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(imageFragment, { format: presentationFormat })
  .createPipeline();

// dynamic resources

let workTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: typeof intermediateFormat;
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
  // pre-rendered scene, work1, work2
  workTextures = [0, 1, 2].map((i) =>
    root['~unstable']
      .createTexture({
        size: [canvas.width * quality, canvas.height * quality],
        format: intermediateFormat,
        dimension: '2d',
      })
      .$usage('sampled', 'render')
      .$name(`work texture ${i}`)
  );
  castAndMergeBindGroup = root.createBindGroup(castAndMergeLayout, {
    scene: workTextures[0],
    iChannel0: workTextures[1],
  });
  imageBindGroup = root.createBindGroup(imageLayout, {
    iChannel0: workTextures[1],
  });
}
const resizeObserver = new ResizeObserver(recreateResources);
resizeObserver.observe(canvas);
recreateResources();

// draw

function draw(timestamp: number) {
  timeUniform.write(timestamp / 1000);
  workResolutionUniform.write(
    d.vec3f(...workTextures[1].props.size, 1),
  );

  prerenderScenePipeline
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: workTextures[0],
    })
    .draw(3);

  for (let i = cascadesNumber - 1; i >= 0; i--) {
    cascadeIndexUniform.write(i);
    castAndMergePipeline
      .with(castAndMergeBindGroup)
      .withColorAttachment({
        loadOp: 'clear',
        storeOp: 'store',
        view: workTextures[2],
      })
      .draw(3);

    workTextures[1].copyFrom(workTextures[2]);
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
  resizeObserver.disconnect();
  root.destroy();
}

export const controls = {
  'Scene': {
    initial: 'Shadertoy',
    options: Object.keys(scenes),
    onSelectChange: (value: keyof typeof scenes) => {
      selectedSceneUniform.write(scenes[value]);
    },
  },

  'Bilinear fix': {
    initial: true,
    onToggleChange: (value: boolean) => {
      bilinearFixUniform.write(Number(value));
    },
  },
  'Luminance postprocessing': {
    initial: true,
    onToggleChange: (value: boolean) => {
      luminancePostprocessingUniform.write(Number(value));
    },
  },
  'Number of cascades': {
    initial: cascadesNumber,
    min: 1,
    max: 9,
    step: 1,
    onSliderChange: (value: number) => {
      cascadesNumber = value;
      cascadesNumberUniform.write(cascadesNumber);
    },
  },
  'Quality': {
    initial: quality * 100,
    min: 10,
    max: 100,
    step: 5,
    onSliderChange: (value: number) => {
      quality = value / 100;
      recreateResources();
    },
  },
};

// #endregion

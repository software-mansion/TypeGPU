import { tgpu, d, common } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { captureAtlas } from './capture.ts';
import { loadModel, modelVertexLayout } from './load-model.ts';
import {
  techniques,
  techniqueSlot,
  impostorVertex,
  impostorFragment,
  atlasFragment,
  type Technique,
} from './shaders.ts';
import { impostorLayout } from './impostor.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const [Teapot, Suzanne] = await Promise.all([
  loadModel(root, '/TypeGPU/assets/phong/teapot.obj'),
  loadModel(root, '/TypeGPU/assets/triplanar-mapping/suzanne.obj'),
]);
const models = { Teapot, Suzanne };
let model = Teapot;
let display: Technique | 'Mesh' | 'Atlas' = 'Parallax';
const camera = root.createUniform(Camera);
const mipBias = root.createUniform(d.f32);
const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});
let atlas = captureAtlas(root, model);
const makeBindGroup = () =>
  root.createBindGroup(impostorLayout, {
    camera,
    mipBias,
    sampler,
    colorAtlas: atlas.color,
    depthAtlas: atlas.depth,
  });
let bindGroup = makeBindGroup();
const depthStencil = {
  format: 'depth24plus',
  depthWriteEnabled: true,
  depthCompare: 'less',
} as const;
const meshPipeline = root.createRenderPipeline({
  attribs: modelVertexLayout.attrib,
  primitive: { cullMode: 'back' },
  depthStencil,
  multisample: { count: 4 },
  vertex: ({ position, normal }) => {
    'use gpu';
    const camera = impostorLayout.$.camera;
    return {
      $position: camera.projection * (camera.view * d.vec4f(position, 1)),
      normal,
    };
  },
  fragment: ({ normal }) => {
    'use gpu';
    return d.vec4f((normal + 1) * 0.5, 1);
  },
});

const createImpostor = (technique: (typeof techniques)[Technique]) =>
  root.with(techniqueSlot, technique).createRenderPipeline({
    primitive: { topology: 'triangle-strip' },
    depthStencil,
    multisample: { count: 4, alphaToCoverageEnabled: true },
    vertex: impostorVertex,
    fragment: impostorFragment,
  });
const impostors = {
  Nearest: createImpostor(techniques.Nearest),
  Blended: createImpostor(techniques.Blended),
  Parallax: createImpostor(techniques.Parallax),
};
const atlasPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: atlasFragment,
});

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2, 1, 8, 1), minZoom: 3.5, maxZoom: 25 },
  (updates) => camera.patch(updates),
);

function createTargets() {
  const size = [Math.max(canvas.width, 1), Math.max(canvas.height, 1)] as const;
  return {
    color: root
      .createTexture({ size, format: navigator.gpu.getPreferredCanvasFormat(), sampleCount: 4 })
      .$usage('render'),
    depth: root.createTexture({ size, format: 'depth24plus', sampleCount: 4 }).$usage('render'),
  };
}
let targets = createTargets();
const resizeObserver = new ResizeObserver(() => {
  targets.color.destroy();
  targets.depth.destroy();
  targets = createTargets();
});
resizeObserver.observe(canvas);

let frameId = 0;
function frame() {
  if (display === 'Atlas') {
    atlasPipeline.with(bindGroup).withColorAttachment({ view: context }).draw(3);
  } else {
    const pipeline =
      display === 'Mesh'
        ? meshPipeline.with(modelVertexLayout, model.vertexBuffer)
        : impostors[display];
    pipeline
      .with(bindGroup)
      .withColorAttachment({ view: targets.color, resolveTarget: context })
      .withDepthStencilAttachment({ view: targets.depth })
      .draw(display === 'Mesh' ? model.vertexCount : 4);
  }
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  Display: {
    initial: display,
    options: ['Nearest', 'Blended', 'Parallax', 'Mesh', 'Atlas'],
    onSelectChange(value) {
      display = value;
    },
  },
  Model: {
    initial: 'Teapot',
    options: ['Teapot', 'Suzanne'],
    onSelectChange(value) {
      if (model === models[value]) {
        return;
      }
      model = models[value];
      const previous = atlas;
      atlas = captureAtlas(root, model);
      bindGroup = makeBindGroup();
      previous.destroy();
    },
  },
  'Mip bias': {
    initial: 0,
    min: 0,
    max: 4,
    step: 0.25,
    onSliderChange(value) {
      mipBias.write(value);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion

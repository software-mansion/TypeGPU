import * as rc from '@typegpu/radiance-cascades';
import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { createDrawInteraction } from './drawInteraction.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const [width, height] = [canvas.width, canvas.height];

// Scene texture + views.
const sceneTexture = root
  .createTexture({
    size: [width, height],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const sceneWriteView = sceneTexture.createView(d.textureStorage2d('rgba16float'));
const sceneSampledView = sceneTexture.createView();

// Samplers.
const linSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Draw params + uniform.
const DrawParams = d.struct({
  isDrawing: d.u32,
  lastMousePos: d.vec2f,
  mousePos: d.vec2f,
  brushRadius: d.f32,
  lightColor: d.vec3f,
});

const paramsUniform = root.createUniform(DrawParams, {
  isDrawing: 0,
  lastMousePos: d.vec2f(0.5),
  mousePos: d.vec2f(0.5),
  brushRadius: 0.05,
  lightColor: d.vec3f(1, 0.9, 0.7),
});

const sceneDataLayout = tgpu.bindGroupLayout({
  sceneRead: { texture: d.texture2d() },
});
const sceneDataBG = root.createBindGroup(sceneDataLayout, {
  sceneRead: sceneSampledView,
});

const drawCompute = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const params = paramsUniform.$;
  if (params.isDrawing === 0) {
    return;
  }

  const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(std.textureDimensions(sceneWriteView.$));

  const noLast = std.any(std.lt(params.lastMousePos, d.vec2f(0)));
  const a = std.select(params.lastMousePos, params.mousePos, noLast);

  const dist = sdf.sdLine(uv, a, params.mousePos);
  if (dist >= params.brushRadius) {
    return;
  }

  const out = d.vec4f(params.lightColor, 1);

  std.textureStore(sceneWriteView.$, d.vec2u(x, y), out);
});

const floodSize = { width: canvas.width, height: canvas.height };
const floodRunner = sdf
  .createJumpFlood({
    root,
    size: floodSize,
    classify: (coord: d.v2u, size: d.v2u) => {
      'use gpu';
      const sceneData = std.textureSampleLevel(
        sceneDataLayout.$.sceneRead,
        linSampler.$,
        (d.vec2f(coord) + 0.5) / d.vec2f(size),
        0,
      );
      return sceneData.w > 0;
    },
    getSdf: (_coord, size, signedDist) => {
      'use gpu';
      const minDim = std.min(size.x, size.y);
      return signedDist / minDim;
    },
    getColor: (_coord, size, _signedDist, insidePx) => {
      'use gpu';
      const uv = (d.vec2f(insidePx) + 0.5) / d.vec2f(size);
      const seedData = std.textureSampleLevel(sceneDataLayout.$.sceneRead, linSampler.$, uv, 0);
      return d.vec4f(seedData.xyz, 1);
    },
  })
  .with(sceneDataBG);

const floodSdfView = floodRunner.sdfOutput.createView();
const floodColorView = floodRunner.colorOutput.createView();

const radianceRunner = rc.createRadianceCascades({
  root,
  size: { width: Math.floor(width / 4), height: Math.floor(height / 4) },
  sdfResolution: floodSize,
  sdf: (uv) => {
    'use gpu';
    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) {
      return 1;
    }
    return std.textureSampleLevel(floodSdfView.$, linSampler.$, uv, 0).x;
  },
  color: (uv) => {
    'use gpu';
    return std.textureSampleLevel(floodColorView.$, linSampler.$, uv, 0).xyz;
  },
});
const radianceRes = radianceRunner.output.createView(d.texture2d());

// Display pipeline.
const displayModeUniform = root.createUniform(d.u32);
const displayFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  let result = d.vec4f(0);
  if (displayModeUniform.$ === 0) {
    const sdfDist = std.textureSampleLevel(floodSdfView.$, linSampler.$, uv, 0).x;
    const sdfTexel = 1 / d.f32(std.textureDimensions(floodSdfView.$).x);
    const edgeWidth = std.max(std.fwidth(sdfDist), sdfTexel);
    const surfaceAlpha = 1 - std.smoothstep(-edgeWidth, edgeWidth, sdfDist);

    const seedColor = std.textureSampleLevel(floodColorView.$, linSampler.$, uv, 0);
    const radiance = std.textureSampleLevel(radianceRes.$, linSampler.$, uv, 0);
    result = d.vec4f(std.mix(radiance.xyz, seedColor.xyz, surfaceAlpha), 1);
  } else {
    const signedDist = std.textureSampleLevel(floodSdfView.$, linSampler.$, uv, 0).x;
    const absDist = std.abs(signedDist);

    const normalizedDist = std.clamp(absDist * 2, 0, 1) ** 0.8;

    const isInside = signedDist < 0;

    const distColor = std.select(
      d.vec3f(normalizedDist, 0, 0),
      d.vec3f(0, 0, normalizedDist),
      isInside,
    );

    result = d.vec4f(distColor, 1);
  }

  return result;
});

const displayPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: displayFragment,
  targets: { format: presentationFormat },
});

let sceneDirty = false;

function drawScene() {
  drawCompute.dispatchThreads(width, height);
  sceneDirty = true;
}

function updateScene() {
  if (sceneDirty) {
    floodRunner.run();
    radianceRunner.run();
    sceneDirty = false;
  }
}

const drawInteraction = createDrawInteraction({
  canvas,
  onDraw({ last, current, color }) {
    paramsUniform.patch({
      lastMousePos: d.vec2f(last?.x ?? -1, last?.y ?? -1),
      mousePos: d.vec2f(current.x, current.y),
      lightColor: color,
      isDrawing: 1,
    });
    drawScene();
  },
  onStop() {
    updateScene();
    paramsUniform.patch({ isDrawing: 0 });
  },
});

let frameId = requestAnimationFrame(frame);
function frame(timestamp: number) {
  drawInteraction.update(timestamp);
  updateScene();

  displayPipeline.withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}

// #region Example controls and cleanup

export const controls = defineControls({
  ...drawInteraction.controls,
  'Brush Size': {
    initial: 0.05,
    min: 0.01,
    max: 0.15,
    step: 0.01,
    onSliderChange(value: number) {
      paramsUniform.patch({
        brushRadius: value,
      });
    },
  },
  'Display Mode': {
    initial: 'Radiance',
    options: ['Radiance', 'Distance'],
    onSelectChange(value: string) {
      displayModeUniform.write(value === 'Radiance' ? 0 : 1);
    },
  },
  Clear: {
    onButtonClick() {
      sceneTexture.clear();
      sceneDirty = true;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion

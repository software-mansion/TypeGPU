import * as rc from '@typegpu/radiance-cascades';
import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

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

  const dims = std.textureDimensions(sceneWriteView.$);
  const aspectF = dims.x / dims.y;
  const invDims = 1 / d.vec2f(dims);

  const uv = (d.vec2f(x, y) + 0.5) * invDims;
  const uvA = uv * d.vec2f(aspectF, 1);

  const mouse = d.vec2f(params.mousePos.x * aspectF, params.mousePos.y);
  const last = d.vec2f(params.lastMousePos.x * aspectF, params.lastMousePos.y);

  const noLast = std.any(std.lt(params.lastMousePos, d.vec2f(0)));
  const a = std.select(last, mouse, noLast);

  const dist = sdf.sdLine(uvA, a, mouse);
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
    // sample sdf
    const sdfDist = std.textureSampleLevel(floodSdfView.$, linSampler.$, uv, 0).x;
    if (sdfDist < 0) {
      // on surface, show seed color
      const seedColor = std.textureSampleLevel(floodColorView.$, linSampler.$, uv, 0);
      result = d.vec4f(seedColor.xyz, 1);
    } else {
      // sample radiance
      result = std.textureSampleLevel(radianceRes.$, linSampler.$, uv, 0);
    }
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

let lastMousePos = { x: -1, y: -1 };
let sceneDirty = false;
let isDrawing = false;

canvas.addEventListener('mousemove', (e) => {
  paramsUniform.writePartial({
    lastMousePos: d.vec2f(lastMousePos.x, lastMousePos.y),
  });

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  lastMousePos = { x, y };
  paramsUniform.writePartial({
    mousePos: d.vec2f(x, y),
  });

  if (isDrawing) {
    sceneDirty = true;
  }
});

canvas.addEventListener('mousedown', () => {
  isDrawing = true;
  sceneDirty = true;
  paramsUniform.writePartial({
    isDrawing: 1,
  });
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
  lastMousePos = { x: -1, y: -1 };
  paramsUniform.writePartial({
    isDrawing: 0,
  });
});

let frameId = requestAnimationFrame(frame);
function frame() {
  if (sceneDirty) {
    drawCompute.dispatchThreads(width, height);
    floodRunner.run();
    radianceRunner.run();
    sceneDirty = false;
  }

  displayPipeline.withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}

// #region Example controls and cleanup

export const controls = defineControls({
  'Light Color': {
    initial: d.vec3f(1, 0.9, 0.7),
    onColorChange(rgb: readonly [number, number, number]) {
      paramsUniform.writePartial({
        lightColor: d.vec3f(...rgb),
      });
    },
  },
  'Brush Size': {
    initial: 0.05,
    min: 0.01,
    max: 0.15,
    step: 0.01,
    onSliderChange(value: number) {
      paramsUniform.writePartial({
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

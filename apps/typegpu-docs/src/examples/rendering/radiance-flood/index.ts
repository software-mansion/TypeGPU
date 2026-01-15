import * as rc from '@typegpu/radiance-cascades';
import * as sdf from '@typegpu/sdf';
import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const [width, height] = [canvas.width / 4, canvas.height / 4];
const aspect = width / height;

const sceneTexture = root['~unstable'].createTexture({
  size: [width, height],
  format: 'rgba8unorm',
}).$usage('storage', 'sampled');

const sceneWriteView = sceneTexture.createView(
  d.textureStorage2d('rgba8unorm'),
);
const sceneSampledView = sceneTexture.createView();

const DrawParams = d.struct({
  isDrawing: d.u32,
  lastMousePos: d.vec2f,
  mousePos: d.vec2f,
  brushRadius: d.f32,
  drawMode: d.u32,
  lightColor: d.vec3f,
});

const paramsUniform = root.createUniform(DrawParams, {
  isDrawing: 0,
  lastMousePos: d.vec2f(0.5),
  mousePos: d.vec2f(0.5),
  brushRadius: 0.05,
  drawMode: 0,
  lightColor: d.vec3f(1, 0.9, 0.7),
});

const drawCompute = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';

  const params = paramsUniform.$;
  if (params.isDrawing === d.u32(0)) {
    return;
  }

  const aspectF = d.f32(aspect);
  const dims = std.textureDimensions(sceneWriteView.$);
  const invDims = d.vec2f(1).div(d.vec2f(dims));

  const uv = d.vec2f(x, y).add(0.5).mul(invDims);
  const uvA = d.vec2f(uv.x * aspectF, uv.y);

  const mouse = d.vec2f(params.mousePos.x * aspectF, params.mousePos.y);

  const last = d.vec2f(
    params.lastMousePos.x * aspectF,
    params.lastMousePos.y,
  );

  const noLast = std.any(std.lt(params.lastMousePos, d.vec2f()));
  const a = std.select(last, mouse, noLast);

  const dist = sdf.sdLine(uvA, a, mouse);
  if (dist >= params.brushRadius) {
    return;
  }

  const isLight = params.drawMode !== d.u32(0);
  const out = std.select(
    d.vec4f(0, 0, 0, 0.5),
    d.vec4f(params.lightColor, 1),
    isLight,
  );

  std.textureStore(sceneWriteView.$, d.vec2u(x, y), out);
});

const floodOutputTexture = root['~unstable']
  .createTexture({
    size: [width, height],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled') as sdf.DistanceTexture;
const floodOutputWriteView = floodOutputTexture.createView(
  d.textureStorage2d('rgba16float', 'write-only'),
);

const sceneDataLayout = tgpu.bindGroupLayout({
  sceneRead: { texture: d.texture2d() },
});
const sceneDataBG = root.createBindGroup(sceneDataLayout, {
  sceneRead: sceneSampledView,
});

const customDistanceWrite = (
  coord: d.v2u,
  signedDist: number,
  insidePx: d.v2u,
) => {
  'use gpu';
  const size = std.textureDimensions(sceneDataLayout.$.sceneRead);
  const uv = d.vec2f(insidePx).add(0.5).div(d.vec2f(size));

  const seedData = std.textureSampleLevel(
    sceneDataLayout.$.sceneRead,
    linSampler.$,
    uv,
    0,
  );

  const isLight = seedData.w > 0.75;
  const outputColor = std.select(d.vec3f(0), seedData.xyz, isLight);

  std.textureStore(
    floodOutputWriteView.$,
    d.vec2i(coord),
    d.vec4f(signedDist, outputColor),
  );
};

const floodRunner = sdf
  .createJumpFlood({
    root,
    size: { width, height },
    output: floodOutputTexture,
    classify: (coord: d.v2u, size: d.v2u) => {
      'use gpu';
      const sceneData = std.textureSampleLevel(
        sceneDataLayout.$.sceneRead,
        linSampler.$,
        d.vec2f(coord).add(0.5).div(d.vec2f(size)),
        0,
      );
      return sceneData.w > 0;
    },
    distanceWrite: customDistanceWrite,
  })
  .with(sceneDataBG);

const res = floodOutputTexture.createView(d.texture2d(d.f32));
const linSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Precompute normalization factor to convert pixel distance to UV distance
const maxDim = Math.max(width, height);

const radianceSceneFn = (uv: d.v2f) => {
  'use gpu';
  // .x = signed distance in pixels, .yzw = propagated light color (0 if wall/empty)
  const sample = std.textureSampleLevel(res.$, linSampler.$, uv, 0);
  const sdfDistPx = sample.x;
  const lightColor = sample.yzw;

  // Convert pixel distance to UV distance (0-1 range) for radiance cascades
  const sdfDistUv = sdfDistPx / d.f32(maxDim);

  // Light emitters have non-zero color, walls/empty have zero color
  // The color is already propagated from the nearest seed
  return rc.SceneData({
    color: d.vec4f(lightColor, 1),
    dist: sdfDistUv,
  });
};

const radianceRunner = rc.createRadianceCascades({
  root,
  scene: radianceSceneFn,
  size: { width: Math.floor(width), height: Math.floor(height) },
});

const radianceRes = radianceRunner.output.createView(
  d.texture2d(),
);

const displayModeUniform = root.createUniform(d.u32);
const displayFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  let result = d.vec4f(0);
  if (displayModeUniform.$ === 0) {
    result = std.textureSample(
      radianceRes.$,
      linSampler.$,
      uv,
    );
  } else {
    result = d.vec4f(
      std.textureSample(
        res.$,
        linSampler.$,
        uv,
      ).xxx,
      1,
    );
  }

  return d.vec4f(result.xyz, 1.0);
});

const displayPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(displayFragment, { format: presentationFormat })
  .createPipeline();

let isMouseDown = false;
let lastMousePos = { x: -1, y: -1 };
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
});

canvas.addEventListener('mousedown', () => {
  isMouseDown = true;
  paramsUniform.writePartial({
    isDrawing: 1,
  });
});

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
  lastMousePos = { x: -1, y: -1 };
  paramsUniform.writePartial({
    isDrawing: 0,
  });
});

let frameId = 0;
function frame() {
  frameId++;

  drawCompute
    .dispatchThreads(width, height);

  floodRunner.run();
  radianceRunner.run();

  displayPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export const controls = {
  'Draw Mode': {
    initial: 'Walls',
    options: ['Walls', 'Light'],
    onSelectChange(value: string) {
      paramsUniform.writePartial({
        drawMode: value === 'Walls' ? 0 : 1,
      });
    },
  },
  'Light Color': {
    initial: [1, 0.9, 0.7],
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
    },
  },
};

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

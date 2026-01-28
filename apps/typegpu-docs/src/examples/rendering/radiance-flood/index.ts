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

const [width, height] = [canvas.width, canvas.height];

// Scene texture + views.
const sceneTexture = root['~unstable'].createTexture({
  size: [width, height],
  format: 'rgba16float',
}).$usage('storage', 'sampled');

const sceneWriteView = sceneTexture.createView(
  d.textureStorage2d('rgba16float'),
);
const sceneSampledView = sceneTexture.createView();

// Samplers.
const nearestSampler = root['~unstable'].createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});
const linSampler = root['~unstable'].createSampler({
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

const drawCompute = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';

  const params = paramsUniform.$;
  if (params.isDrawing === 0) {
    return;
  }

  const dims = std.textureDimensions(sceneWriteView.$);
  const aspectF = dims.x / dims.y;
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

  const out = d.vec4f(params.lightColor, 1);

  std.textureStore(sceneWriteView.$, d.vec2u(x, y), out);
});

const customDistanceWrite = (
  _coord: d.v2u,
  texture: d.textureStorage2d<'rgba16uint', 'read-only'>,
  signedDist: number,
  insidePx: d.v2u,
) => {
  'use gpu';
  const size = std.textureDimensions(texture);
  const uv = d.vec2f(insidePx).add(0.5).div(d.vec2f(size));

  const seedData = std.textureSampleLevel(
    sceneDataLayout.$.sceneRead,
    nearestSampler.$,
    uv,
    0,
  );

  return d.vec4f(seedData.xyz, signedDist);
};

const floodRunner = sdf
  .createJumpFlood({
    root,
    size: { width: width, height: height },
    classify: (coord: d.v2u, size: d.v2u) => {
      'use gpu';
      const sceneData = std.textureSampleLevel(
        sceneDataLayout.$.sceneRead,
        nearestSampler.$,
        d.vec2f(coord).add(0.5).div(d.vec2f(size)),
        0,
      );
      return sceneData.w > 0;
    },
    getDistance: customDistanceWrite,
  })
  .with(sceneDataBG);

const res = floodRunner.output.createView(d.texture2d());

const radianceSceneFn = (uv: d.v2f) => {
  'use gpu';
  if (std.any(std.lt(uv, d.vec2f(0))) || std.any(std.gt(uv, d.vec2f(1)))) {
    return d.vec4f(0, 0, 0, 1);
  }
  const dims = std.textureDimensions(res.$);
  const minDim = std.min(dims.x, dims.y);
  // .xyz = propagated light color (0 if wall/empty), .w = signed distance in pixels
  const sample = std.textureSampleLevel(res.$, linSampler.$, uv, 0);
  const lightColor = sample.xyz;
  const sdfDistPx = sample.w;

  // Convert pixel distance to UV distance (0-1 range) for radiance cascades
  const sdfDistUv = sdfDistPx / d.f32(minDim);

  // Light emitters have non-zero color, walls/empty have zero color
  // The color is already propagated from the nearest seed
  // vec4f: xyz = color, w = distance
  return d.vec4f(lightColor, sdfDistUv);
};

const radianceRunner = rc.createRadianceCascades({
  root,
  scene: radianceSceneFn,
  size: { width: width / 16, height: height / 16 },
});
const radianceRes = radianceRunner.output.createView(d.texture2d());

// Display pipeline.
const displayModeUniform = root.createUniform(d.u32);
const displayFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  let result = d.vec4f(0);
  if (displayModeUniform.$ === 0) {
    // sample sdf
    const sdfSample = std.textureSampleLevel(
      res.$,
      linSampler.$,
      uv,
      0,
    );
    const sdfDist = sdfSample.w;
    if (sdfDist < 0) {
      // on surface, show seed color
      result = d.vec4f(sdfSample.xyz, 1.0);
    } else {
      // sample radiance
      result = std.textureSampleLevel(
        radianceRes.$,
        linSampler.$,
        uv,
        0,
      );
    }
  } else {
    const dims = std.textureDimensions(radianceRes.$);
    const distSample = std.textureSample(
      res.$,
      linSampler.$,
      uv,
    );
    const signedDist = distSample.w;
    const absDist = std.abs(signedDist);
    const maxDim = d.f32(std.max(dims.x, dims.y));

    const normalizedDist = std.clamp(absDist / d.f32(maxDim * 0.5), 0.0, 1.0) **
      0.8;

    const isInside = signedDist < 0.0;

    const distColor = std.select(
      d.vec3f(normalizedDist, 0.0, 0.0),
      d.vec3f(0.0, 0.0, normalizedDist),
      isInside,
    );

    result = d.vec4f(distColor, 1.0);
  }

  return d.vec4f(result.xyz, 1.0);
});

const displayPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(displayFragment, { format: presentationFormat })
  .createPipeline();

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
  paramsUniform.writePartial({
    isDrawing: 1,
  });
});

canvas.addEventListener('mouseup', () => {
  lastMousePos = { x: -1, y: -1 };
  paramsUniform.writePartial({
    isDrawing: 0,
  });
});

let frameId = 0;
function frame() {
  frameId++;

  drawCompute.dispatchThreads(width, height);

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

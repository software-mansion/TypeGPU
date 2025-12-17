import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { fullScreenTriangle } from 'typegpu/common';

import { KnobBehavior } from './knob.ts';
import { CameraController } from './camera.ts';
import {
  cameraUniformSlot,
  darkModeUniformSlot,
  DirectionalLight,
  effectTimeUniformSlot,
  jellyColorUniformSlot,
  knobBehaviorSlot,
  lightUniformSlot,
  randomUniformSlot,
  rayMarchLayout,
  sampleLayout,
} from './dataTypes.ts';
import { createBackgroundTexture, createTextures } from './utils.ts';
import { TAAResolver } from './taa.ts';
import { DARK_MODE_LIGHT_DIR, LIGHT_MODE_LIGHT_DIR } from './constants.ts';
import { raymarchFn } from './raymarchers.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const knobBehavior = new KnobBehavior(root);
await knobBehavior.init();

let qualityScale = 0.5;
let [width, height] = [
  canvas.width * qualityScale,
  canvas.height * qualityScale,
];

let textures = createTextures(root, width, height);
let backgroundTexture = createBackgroundTexture(root, width, height);

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const camera = new CameraController(
  root,
  d.vec3f(0, 2.7, 0.8),
  d.vec3f(0, 0, 0),
  d.vec3f(0, 1, 0),
  Math.PI / 4,
  width,
  height,
);
const cameraUniform = camera.cameraUniform;

const lightUniform = root.createUniform(DirectionalLight, {
  direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
  color: d.vec3f(1, 1, 1),
});

const jellyColorUniform = root.createUniform(
  d.vec4f,
  d.vec4f(1.0, 0.45, 0.075, 1.0),
);

const darkModeUniform = root.createUniform(d.u32);

const randomUniform = root.createUniform(d.vec2f);

const effectTimeUniform = root.createUniform(d.f32);

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    sampleLayout.$.currentTexture,
    filteringSampler.$,
    input.uv,
  );
});

const rayMarchPipeline = root['~unstable']
  .with(knobBehaviorSlot, knobBehavior)
  .with(cameraUniformSlot, cameraUniform)
  .with(lightUniformSlot, lightUniform)
  .with(jellyColorUniformSlot, jellyColorUniform)
  .with(darkModeUniformSlot, darkModeUniform)
  .with(randomUniformSlot, randomUniform)
  .with(effectTimeUniformSlot, effectTimeUniform)
  .withVertex(fullScreenTriangle, {})
  .withFragment(raymarchFn, { format: 'rgba8unorm' })
  .createPipeline();

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let lastTimeStamp = performance.now();
let effectTime = 0;
let frameCount = 0;
const taaResolver = new TAAResolver(root, width, height);

function createBindGroups() {
  return {
    rayMarch: root.createBindGroup(rayMarchLayout, {
      backgroundTexture: backgroundTexture.sampled,
    }),
    render: [0, 1].map((frame) =>
      root.createBindGroup(sampleLayout, {
        currentTexture: taaResolver.getResolvedTexture(frame),
      })
    ),
  };
}

let bindGroups = createBindGroups();

function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  randomUniform.write(
    d.vec2f((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
  );
  effectTime += deltaTime * (5 ** (2 * knobBehavior.progress));
  effectTimeUniform.write(effectTime);

  knobBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .withColorAttachment({
      view: root.unwrap(textures[currentFrame].sampled),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(
    textures[currentFrame].sampled,
    frameCount,
    currentFrame,
  );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(bindGroups.render[currentFrame])
    .draw(3);

  requestAnimationFrame(render);
}

function handleResize() {
  [width, height] = [
    canvas.width * qualityScale,
    canvas.height * qualityScale,
  ];
  camera.updateProjection(Math.PI / 4, width, height);
  textures = createTextures(root, width, height);
  backgroundTexture = createBackgroundTexture(root, width, height);
  taaResolver.resize(width, height);
  frameCount = 0;

  bindGroups = createBindGroups();
}

const resizeObserver = new ResizeObserver(() => {
  handleResize();
});
resizeObserver.observe(canvas);

requestAnimationFrame(render);

// #region Example controls and cleanup

let prevX = 0;

canvas.addEventListener('touchstart', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.touches[0].clientX;
});

canvas.addEventListener('touchend', (event) => {
  knobBehavior.pressed = false;
  knobBehavior.toggled = !knobBehavior.toggled;
});

canvas.addEventListener('touchmove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.touches[0].clientX;
  knobBehavior.progress += (x - prevX) / canvas.clientHeight * 2;
  prevX = x;
});

canvas.addEventListener('mousedown', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.clientX;
});

canvas.addEventListener('mouseup', (event) => {
  knobBehavior.pressed = false;
  knobBehavior.toggled = !knobBehavior.toggled;
  event.stopPropagation();
});

window.addEventListener('mouseup', (event) => {
  knobBehavior.pressed = false;
});

canvas.addEventListener('mousemove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.clientX;
  knobBehavior.progress += (x - prevX) / canvas.clientHeight * 2;
  prevX = x;
});

async function autoSetQuaility() {
  if (!hasTimestampQuery) {
    return 0.5;
  }

  const targetFrameTime = 5;
  const tolerance = 2.0;
  let resolutionScale = 0.3;
  let lastTimeMs = 0;

  const measurePipeline = rayMarchPipeline
    .withPerformanceCallback((start, end) => {
      lastTimeMs = Number(end - start) / 1e6;
    });

  for (let i = 0; i < 8; i++) {
    const testTexture = root['~unstable'].createTexture({
      size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
      format: 'rgba8unorm',
    }).$usage('render');

    measurePipeline
      .withColorAttachment({
        view: root.unwrap(testTexture).createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(
        root.createBindGroup(rayMarchLayout, {
          backgroundTexture: backgroundTexture.sampled,
        }),
      )
      .draw(3);

    await root.device.queue.onSubmittedWorkDone();
    testTexture.destroy();

    if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
      break;
    }

    const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
    resolutionScale = Math.max(
      0.3,
      Math.min(1.0, resolutionScale + adjustment),
    );
  }

  console.log(`Auto-selected quality scale: ${resolutionScale.toFixed(2)}`);
  return resolutionScale;
}

export const controls = {
  'Quality': {
    initial: 'Ultra',
    options: [
      'Auto',
      'Very Low',
      'Low',
      'Medium',
      'High',
      'Ultra',
    ],
    onSelectChange: (value: string) => {
      if (value === 'Auto') {
        autoSetQuaility().then((scale) => {
          qualityScale = scale;
          handleResize();
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        'Low': 0.5,
        'Medium': 0.7,
        'High': 0.85,
        'Ultra': 1.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      handleResize();
    },
  },
  'Jelly Color': {
    // initial: [0.63, 0.08, 1],
    initial: [1.0, 0.35, 0.075],
    onColorChange: (c: [number, number, number]) => {
      jellyColorUniform.write(d.vec4f(...c, 1.0));
    },
  },
  'Dark Mode': {
    initial: true,
    onToggleChange: (v: boolean) => {
      darkModeUniform.write(d.u32(v));
      lightUniform.writePartial({
        direction: v ? DARK_MODE_LIGHT_DIR : LIGHT_MODE_LIGHT_DIR,
      });
    },
  },
};

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion

import { tgpu, common, d, std } from 'typegpu';

import { KnobBehavior } from './knob.ts';
import { CameraController } from './camera.ts';
import {
  cameraUniformSlot,
  DirectionalLight,
  jellyColorUniformSlot,
  knobBehaviorSlot,
  lightUniformSlot,
  randomUniformSlot,
  rayMarchLayout,
  sampleLayout,
} from './dataTypes.ts';
import { createBackgroundTexture, createTextures } from './utils.ts';
import { TAAResolver } from './taa.ts';
import { LIGHT_DIR } from './constants.ts';
import { raymarchFn } from './raymarchers.ts';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');

const knobBehavior = new KnobBehavior(root);
await knobBehavior.init();

let qualityScale = 0.5;
let [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];

let textures = createTextures(root, width, height);
let backgroundTexture = createBackgroundTexture(root, width, height);

const filteringSampler = root.createSampler({
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
  direction: LIGHT_DIR,
  color: d.vec3f(1, 1, 1),
});

const DEFAULT_JELLY_COLOR = d.vec3f(1, 0, 0.25);
const jellyColorUniform = root.createUniform(d.vec4f, d.vec4f(DEFAULT_JELLY_COLOR, 1));

const randomUniform = root.createUniform(d.vec2f);

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, input.uv);
});

const rayMarchPipeline = root
  .with(knobBehaviorSlot, knobBehavior)
  .with(cameraUniformSlot, cameraUniform)
  .with(lightUniformSlot, lightUniform)
  .with(jellyColorUniformSlot, jellyColorUniform)
  .with(randomUniformSlot, randomUniform)
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: raymarchFn,
    targets: { format: 'rgba8unorm' },
  });

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragmentMain,
  targets: { format: presentationFormat },
});

let lastTimeStamp = performance.now();
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
      }),
    ),
  };
}

let bindGroups = createBindGroups();

let animationFrameHandle: number;
function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  randomUniform.write(d.vec2f((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
  knobBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .with(bindGroups.rayMarch)
    .withColorAttachment({
      view: textures[currentFrame].sampled,
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

  renderPipeline
    .withColorAttachment({ view: context })
    .with(bindGroups.render[currentFrame])
    .draw(3);

  animationFrameHandle = requestAnimationFrame(render);
}

function destroyRenderTextures() {
  for (const { texture } of textures) {
    texture.destroy();
  }
  backgroundTexture.texture.destroy();
}

function handleResize() {
  [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];
  camera.updateProjection(Math.PI / 4, width, height);
  destroyRenderTextures();
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

animationFrameHandle = requestAnimationFrame(render);

// #region Example controls and cleanup

let prevX = 0;

canvas.addEventListener('touchstart', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.touches[0].clientX;
});

canvas.addEventListener('touchend', () => {
  knobBehavior.pressed = false;
  knobBehavior.toggled = !knobBehavior.toggled;
});

canvas.addEventListener('touchmove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.touches[0].clientX;
  knobBehavior.progress += ((x - prevX) / canvas.clientHeight) * 2;
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

function handleMouseUp() {
  knobBehavior.pressed = false;
}

window.addEventListener('mouseup', handleMouseUp);

canvas.addEventListener('mousemove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.clientX;
  knobBehavior.progress += ((x - prevX) / canvas.clientHeight) * 2;
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

  const measurePipeline = rayMarchPipeline.withPerformanceCallback((start, end) => {
    lastTimeMs = Number(end - start) / 1e6;
  });

  for (let i = 0; i < 8; i++) {
    const testTexture = root
      .createTexture({
        size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
        format: 'rgba8unorm',
      })
      .$usage('render');

    measurePipeline
      .withColorAttachment({
        view: testTexture,
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
    resolutionScale = Math.max(0.3, Math.min(1.0, resolutionScale + adjustment));
  }

  console.log(`Auto-selected quality scale: ${resolutionScale.toFixed(2)}`);
  return resolutionScale;
}

export const controls = defineControls({
  Quality: {
    initial: 'Ultra',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value) => {
      if (value === 'Auto') {
        void autoSetQuaility().then((scale) => {
          qualityScale = scale;
          handleResize();
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        Low: 0.5,
        Medium: 0.7,
        High: 0.85,
        Ultra: 1.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      handleResize();
    },
  },
  'Jelly Color': {
    initial: DEFAULT_JELLY_COLOR,
    onColorChange: (c) => {
      jellyColorUniform.write(d.vec4f(c, 1));
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameHandle);
  resizeObserver.disconnect();
  window.removeEventListener('mouseup', handleMouseUp);
  destroyRenderTextures();
  taaResolver.destroy();
  root.destroy();
}

// #endregion

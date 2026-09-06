import { tgpu, common, d, std } from 'typegpu';
import { blueNoise2d } from '@typegpu/noise';

import { PhoneMotion } from './motion.ts';
import { KnobBehavior } from './knob.ts';
import { CameraController } from './camera.ts';
import {
  cameraUniformSlot,
  darkModeUniformSlot,
  DirectionalLight,
  jellyColorUniformSlot,
  knobBehaviorSlot,
  lightUniformSlot,
  sampleLayout,
} from './dataTypes.ts';
import { createTextures } from './utils.ts';
import { TAAResolver } from './taa.ts';
import { LIGHT_DIR, LIGHT_MODE_LIGHT_DIR } from './constants.ts';
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
const phoneMotion = new PhoneMotion();
knobBehavior.motionAcceleration = phoneMotion.acceleration;

let qualityScale = 0.5;
let [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];

let textures = createTextures(root, width, height);

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
  direction: LIGHT_MODE_LIGHT_DIR,
  color: d.vec3f(1, 1, 1),
});

const DEFAULT_JELLY_COLOR = d.vec3f(1, 0, 0.25);
const jellyColorUniform = root.createUniform(d.vec4f, d.vec4f(DEFAULT_JELLY_COLOR, 1));

const darkModeUniform = root.createUniform(d.u32, 0);
// Generate and upload once at startup; this array can also be precomputed at build time.
const BLUE_NOISE_SIZE = 64;
const blueNoise = root.createReadonly(
  d.arrayOf(d.f32, BLUE_NOISE_SIZE * BLUE_NOISE_SIZE),
  blueNoise2d.generate({ size: BLUE_NOISE_SIZE }),
);

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f, position: d.builtin.position },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const color = std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, input.uv);
  // Dither in display space after TAA and upscaling, before the canvas quantizes to 8 bits.
  // Tile at output-pixel resolution without filtering. Keep it fixed to avoid flicker,
  // and share the blue-noise value across RGB to avoid colored speckles.
  const pixel = d.vec2u(input.position.xy) % d.vec2u(BLUE_NOISE_SIZE);
  const threshold = blueNoise.$[pixel.y * BLUE_NOISE_SIZE + pixel.x];
  const noise = ((threshold - 0.5) * 12) / 255;
  return d.vec4f(std.saturate(color.rgb + noise), color.a);
});

const rayMarchPipeline = root
  .with(knobBehaviorSlot, knobBehavior)
  .with(cameraUniformSlot, cameraUniform)
  .with(lightUniformSlot, lightUniform)
  .with(jellyColorUniformSlot, jellyColorUniform)
  .with(darkModeUniformSlot, darkModeUniform)
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: raymarchFn,
    targets: { format: 'rgba16float' },
  });

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragmentMain,
  targets: { format: presentationFormat },
});

let lastTimeStamp = performance.now();
let frameCount = 0;
const taaResolver = new TAAResolver(root, width, height);

function createRenderBindGroups() {
  return [0, 1].map((frame) =>
    root.createBindGroup(sampleLayout, {
      currentTexture: taaResolver.getResolvedTexture(frame),
    }),
  );
}

let renderBindGroups = createRenderBindGroups();

let animationFrameHandle: number;
function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  phoneMotion.update();
  knobBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .withColorAttachment({
      view: textures[currentFrame].sampled,
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

  renderPipeline
    .withColorAttachment({ view: context })
    .with(renderBindGroups[currentFrame])
    .draw(3);

  animationFrameHandle = requestAnimationFrame(render);
}

function destroyRenderTextures() {
  for (const { texture } of textures) {
    texture.destroy();
  }
}

function handleResize() {
  [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];
  camera.updateProjection(Math.PI / 4, width, height);
  destroyRenderTextures();
  textures = createTextures(root, width, height);
  taaResolver.resize(width, height);
  frameCount = 0;

  renderBindGroups = createRenderBindGroups();
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

async function autoSetQuality() {
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
        format: 'rgba16float',
      })
      .$usage('render');

    measurePipeline
      .withColorAttachment({
        view: testTexture,
        loadOp: 'clear',
        storeOp: 'store',
      })
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
  'Enable Phone Motion': {
    onButtonClick: () => phoneMotion.enable(),
  },
  'Dark Mode': {
    initial: false,
    onToggleChange: (dark) => {
      darkModeUniform.write(d.u32(dark));
      lightUniform.patch({ direction: dark ? LIGHT_DIR : LIGHT_MODE_LIGHT_DIR });
      // Discard the previous lighting setup's TAA history without reallocating textures.
      frameCount = 0;
    },
  },
  Quality: {
    initial: 'Ultra',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value) => {
      if (value === 'Auto') {
        void autoSetQuality().then((scale) => {
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
  phoneMotion.destroy();
  window.removeEventListener('mouseup', handleMouseUp);
  destroyRenderTextures();
  taaResolver.destroy();
  root.destroy();
}

// #endregion

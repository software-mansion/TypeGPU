import { linearToSrgb, srgbToLinear } from '@typegpu/color';
import * as post from '@typegpu/postprocess';
import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const status = document.querySelector('[data-pass-count]') as HTMLElement;
const context = root.configureContext({ canvas });
const cameraStatus = document.querySelector('[data-camera-status]') as HTMLElement;
const sourceLabel = document.querySelector('[data-source-label]') as HTMLElement;
const video = document.createElement('video');
video.muted = true;
video.playsInline = true;
let cameraActive = false;
let stream: MediaStream | undefined;
let frameCallback: number | undefined;
let inputRequest = 0;
let disposed = false;

// A linear HDR test image: bright discs, sharp edges, and fine stripes.
const scene = root
  .createTexture({ size: [960, 600], format: 'rgba16float' })
  .$usage('render', 'sampled');
const sceneView = scene.createView();
const scenePipeline = root
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
      'use gpu';
      const p = (uv - 0.5) * d.vec2f(1.6, 1);
      const stripes = 0.5 + 0.5 * std.cos((p.x + p.y * 0.3) * 180);
      let color = d.vec3f(0.018, 0.028, 0.055) + d.vec3f(0.06) * stripes;
      for (const i of std.range(3)) {
        const center = d.vec2f((d.f32(i) - 1) * 0.44, 0.07 * std.cos(d.f32(i) * 3.14));
        const distance = std.length(p - center);
        const tint = 0.5 + 0.5 * std.cos(d.vec3f(0, 2, 4) + d.f32(i) * 2);
        const disc = 1 - std.smoothstep(0.145, 0.15, distance);
        const halo = std.exp(-distance * distance * 45);
        const ring = 1 - std.smoothstep(0.002, 0.005, std.abs(distance - 0.21));
        color += tint * (disc * 3 + halo * 0.8 + ring * 4);
      }
      return d.vec4f(color, 1);
    }),
    targets: { format: 'rgba16float' },
  })
  .withColorAttachment({ view: scene.createView('render') });
scenePipeline.draw(3);

// Uniform changes do not rebuild the stack or recompile its shaders.
const exposure = root.createUniform(d.f32, 1);
const saturation = root.createUniform(d.f32, 1);
const split = root.createUniform(d.f32, 0.35);
const grade = post.oneToOnePass((color: d.v4f) => {
  'use gpu';
  const rgb = color.rgb * exposure.$;
  const luminance = std.dot(rgb, d.vec3f(0.2126, 0.7152, 0.0722));
  return d.vec4f(std.mix(d.vec3f(luminance), rgb, saturation.$), color.a);
});

const curves = {
  ACES: post.acesToneMapping(),
  Reinhard: post.reinhardToneMapping(),
  Exponential: post.exposureToneMapping(),
};
let curve: keyof typeof curves = 'ACES';
let blur: 'Gaussian' | 'Box' | 'Bokeh' | 'None' = 'Gaussian';
let method: 'Single pass' | 'Separable' = 'Separable';
const blurSettings = root.createUniform(
  d.struct({
    blur: d.struct({ radius: d.i32 }),
  }),
  { blur: { radius: 3 } },
);
const radius = () => blurSettings.$.blur.radius;
let halfResolution = false;

const presentationLayout = tgpu.bindGroupLayout({ processed: { texture: d.texture2d(d.f32) } });
const cameraLayout = tgpu.bindGroupLayout({ input: { externalTexture: d.textureExternal() } });
const cameraSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const original = tgpu.slot<(uv: d.v2f) => d.v4f>((uv) => {
  'use gpu';
  return post.loadPixel(sceneView.$, uv);
});
const presentationOptions = {
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    let color = post.loadPixel(presentationLayout.$.processed, uv);
    if (uv.x < split.$) {
      color = original.$(uv);
    }
    if (std.abs(uv.x - split.$) < 0.0015) {
      return d.vec4f(0.9, 0.95, 1, 1);
    }
    return d.vec4f(linearToSrgb(std.max(color.rgb, d.vec3f(0))), 1);
  }),
};
const present = root
  .createRenderPipeline(presentationOptions)
  .withColorAttachment({ view: context });
const presentCamera = root
  .with(original, (uv) => {
    'use gpu';
    const color = std.textureSampleBaseClampToEdge(cameraLayout.$.input, cameraSampler.$, uv);
    return d.vec4f(srgbToLinear(color.rgb), color.a);
  })
  .createRenderPipeline(presentationOptions)
  .withColorAttachment({ view: context });

function readInput(): post.StackInput {
  if (!cameraActive) {
    return scene;
  }
  return {
    texture: root.device.importExternalTexture({ source: video }),
    size: [video.videoWidth, video.videoHeight],
  };
}

function buildStack() {
  const passes: post.PostprocessPass[] = [];
  if (cameraActive) {
    // Camera frames are sRGB; blur and grading operate on linear color.
    passes.push(
      post.oneToOnePass((color: d.v4f) => {
        'use gpu';
        return d.vec4f(srgbToLinear(color.rgb), color.a);
      }),
    );
  }
  if (halfResolution) {
    // Resizing starts a separate pass, because the following blur needs neighbors.
    passes.push(
      post.standalonePass({
        size: ([width, height]) => [
          Math.max(1, Math.floor(width / 2)),
          Math.max(1, Math.floor(height / 2)),
        ],
        callback: post.loadPixel,
      }),
    );
  }
  if (blur === 'Gaussian') {
    passes.push(
      method === 'Separable'
        ? post.separableGaussianBlur({ radius })
        : post.singlePassGaussianBlur({ radius }),
    );
  }
  if (blur === 'Box') {
    passes.push(
      method === 'Separable'
        ? post.separableBoxBlur({ radius })
        : post.singlePassBoxBlur({ radius }),
    );
  }
  if (blur === 'Bokeh') {
    passes.push(post.bokehBlur({ radius }));
  }
  // Both pixel-local callbacks fuse into the final blur stage automatically.
  passes.push(grade, curves[curve]);
  const stackLayout = post.createStackLayout(passes);
  const stack = stackLayout.instantiate({ root, input: readInput() });
  const size = stack.outputSize;
  if (size === 'adapt') {
    throw new Error('This example uses fixed output dimensions.');
  }
  const output = root
    .createTexture({ size: [size[0], size[1]], format: 'rgba16float' })
    .$usage('render', 'sampled');
  const presentationGroup = root.createBindGroup(presentationLayout, { processed: output });
  return { stack, output, presentationGroup, effectCount: passes.length };
}

let current = buildStack();
function render() {
  if (disposed) {
    return;
  }
  const input = readInput();
  current.stack.input = input;
  const size = current.stack.outputSize;
  if (size === 'adapt') {
    throw new Error('This example uses fixed output dimensions.');
  }
  if (current.output.props.size[0] !== size[0] || current.output.props.size[1] !== size[1]) {
    current.output.destroy();
    current.output = root
      .createTexture({ size: [size[0], size[1]], format: 'rgba16float' })
      .$usage('render', 'sampled');
    current.presentationGroup = root.createBindGroup(presentationLayout, {
      processed: current.output,
    });
  }
  const [width, height] = cameraActive ? [video.videoWidth, video.videoHeight] : [960, 600];
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  status.textContent = `${current.effectCount} effects → ${current.stack.passCount} post-processing ${current.stack.passCount === 1 ? 'pass' : 'passes'} · ${size.join(' × ')}`;
  const encoder = root['~unstable'].createCommandEncoder();
  current.stack.render({ output: current.output, encoder });
  if ('texture' in input) {
    presentCamera
      .with(root.createBindGroup(cameraLayout, { input: input.texture }))
      .with(current.presentationGroup)
      .with(encoder)
      .draw(3);
  } else {
    present.with(current.presentationGroup).with(encoder).draw(3);
  }
  encoder.submit();
}
function rebuild() {
  const next = buildStack();
  current.stack.destroy();
  current.output.destroy();
  current = next;
  render();
}
render();

function stopCamera() {
  cameraActive = false;
  if (frameCallback !== undefined) {
    video.cancelVideoFrameCallback(frameCallback);
    frameCallback = undefined;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video.pause();
  video.srcObject = null;
}

function onCameraFrame() {
  if (!cameraActive || disposed) {
    return;
  }
  render();
  frameCallback = video.requestVideoFrameCallback(onCameraFrame);
}

async function selectInput(value: 'Procedural' | 'Camera') {
  const request = ++inputRequest;
  stopCamera();
  sourceLabel.textContent = 'Original HDR (clipped) ← → Post-processed';
  cameraStatus.textContent = '';
  rebuild();
  if (value === 'Procedural') {
    return;
  }
  cameraStatus.textContent = 'Waiting for camera access…';
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 600 },
        facingMode: 'user',
      },
    });
    if (disposed || request !== inputRequest) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = nextStream;
    video.srcObject = stream;
    await video.play();
    if (disposed || request !== inputRequest) {
      return;
    }
    cameraActive = true;
    sourceLabel.textContent = 'Original camera ← → Post-processed';
    cameraStatus.textContent = '';
    rebuild();
    frameCallback = video.requestVideoFrameCallback(onCameraFrame);
  } catch (error) {
    if (disposed || request !== inputRequest) {
      return;
    }
    stopCamera();
    sourceLabel.textContent = 'Original HDR (clipped) ← → Post-processed';
    rebuild();
    cameraStatus.textContent = `Camera unavailable: ${error instanceof Error ? error.message : String(error)}. Showing the procedural image. Select Camera again to retry.`;
  }
}

// #region Example controls & Cleanup
export const controls = defineControls({
  Input: {
    initial: 'Procedural',
    options: ['Procedural', 'Camera'],
    onSelectChange: selectInput,
  },
  Blur: {
    initial: 'Gaussian',
    options: ['Gaussian', 'Box', 'Bokeh', 'None'],
    onSelectChange(value) {
      blur = value;
      rebuild();
    },
  },
  Method: {
    initial: 'Separable',
    options: ['Separable', 'Single pass'],
    onSelectChange(value) {
      method = value;
      rebuild();
    },
  },
  Radius: {
    initial: 3,
    min: 0,
    max: 8,
    step: 1,
    onSliderChange(value) {
      blurSettings.patch({ blur: { radius: value } });
      render();
    },
  },
  'Tone mapping': {
    initial: 'ACES',
    options: ['ACES', 'Reinhard', 'Exponential'],
    onSelectChange(value) {
      curve = value;
      rebuild();
    },
  },
  Exposure: {
    initial: 1,
    min: 0.1,
    max: 4,
    step: 0.05,
    onSliderChange(value) {
      exposure.write(value);
      render();
    },
  },
  Saturation: {
    initial: 1,
    min: 0,
    max: 2,
    step: 0.05,
    onSliderChange(value) {
      saturation.write(value);
      render();
    },
  },
  'Before / after': {
    initial: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(value) {
      split.write(value);
      render();
    },
  },
  'Half resolution': {
    initial: false,
    onToggleChange(value) {
      halfResolution = value;
      rebuild();
    },
  },
});

export function onCleanup() {
  disposed = true;
  inputRequest++;
  stopCamera();
  current.stack.destroy();
  current.output.destroy();
  root.destroy();
}
// #endregion

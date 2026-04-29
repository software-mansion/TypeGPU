import tgpu, { d, std, common } from 'typegpu';
import * as sdf from '@typegpu/sdf';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init();

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor((rect.width || 1024) * pixelRatio));
  const height = Math.max(1, Math.floor((rect.height || 768) * pixelRatio));

  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
}

syncCanvasSize();
const context = root.configureContext({ canvas });

const sdTriangleIsosceles = (p: d.v2f, q: d.v2f) => {
  'use gpu';
  const pw = d.vec2f(p);
  pw.x = std.abs(p.x);

  const a = pw - q * std.clamp(std.dot(pw, q) / std.dot(q, q), 0, 1);
  const b = pw - q * d.vec2f(std.clamp(pw.x / q.x, 0, 1), 1);

  const s = -std.sign(q.y);
  const dv = std.min(
    d.vec2f(std.dot(a, a), s * (pw.x * q.y - pw.y * q.x)),
    d.vec2f(std.dot(b, b), s * (pw.y - q.y)),
  );
  return -std.sqrt(dv.x) * std.sign(dv.y);
};

const sdArrow = (point: d.v2f, from: d.v2f, to: d.v2f, shaftRadius: number, headSize: d.v2f) => {
  'use gpu';
  const dir = std.normalize(to - from);

  const right = d.vec2f(dir.y, -dir.x);
  const localP = d.vec2f(std.dot(point - to, right), -std.dot(point - to, dir));
  const head = sdTriangleIsosceles(localP, headSize);

  const shaftTip = to - dir * headSize.y;
  const shaft = sdf.sdLine(point, from, shaftTip) - shaftRadius;

  return std.min(shaft, head);
};

const letterTex = root
  .createTexture({
    size: [1024, 1024],
    format: 'rgba8unorm',
  })
  .$usage('render', 'sampled');
const sampledView = letterTex.createView();
const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 96;
const AXIS_LABEL_COUNT = 5;
const LABELS = ['0', '0.25', '0.5', '0.75', '1', '2', '3', '4'] as const;
const REMAP_LABEL_LAYERS = [0, 4, 5, 6, 7] as const;

const labelTexture = root
  .createTexture({
    size: [LABEL_WIDTH, LABEL_HEIGHT, LABELS.length],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
const labelTextureView = labelTexture.createView(d.texture2dArray(d.f32));
const labelSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

async function bakeLabelTextureArray() {
  await document.fonts?.ready;

  const labelCanvas = new OffscreenCanvas(LABEL_WIDTH, LABEL_HEIGHT);
  const labelCtx = labelCanvas.getContext('2d');

  if (!labelCtx) {
    throw new Error('Failed to get label context');
  }

  const bitmaps: ImageBitmap[] = [];

  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';
  labelCtx.font = '700 58px "JetBrains Mono", "SF Mono", monospace';
  labelCtx.fillStyle = 'rgba(18, 22, 30, 1)';

  for (const label of LABELS) {
    labelCtx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    labelCtx.fillText(label, LABEL_WIDTH / 2, LABEL_HEIGHT / 2 + 2);
    bitmaps.push(await createImageBitmap(labelCanvas));
  }

  labelTexture.write(bitmaps);
}

await bakeLabelTextureArray();

const letterSourceLayout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d() },
});
const letterSourceBindGroup = root.createBindGroup(letterSourceLayout, {
  source: sampledView,
});

const offscreen = new OffscreenCanvas(1024, 1024);
const ctx = offscreen.getContext('2d');

if (!ctx) {
  throw new Error('Failed to get offscreen context');
}

ctx.fillStyle = 'white';
ctx.font = '1024px Aeonik';
ctx.textBaseline = 'top';
ctx.fillText('t', 352, 0);

const image = ctx.getImageData(0, 0, 1024, 1024);
letterTex.write(image);

const floodRunner = sdf
  .createJumpFlood({
    root,
    size: { width: 1024, height: 1024 },
    classify: (coord) => {
      'use gpu';
      const letter = std.textureLoad(letterSourceLayout.$.source, coord, 0);
      return letter.a > 0.5;
    },
    getSdf: (_coord, size, signedDist) => {
      'use gpu';
      return signedDist / d.f32(std.min(size.x, size.y));
    },
    getColor: (_coord, _size, _signedDist, insidePx) => {
      'use gpu';
      const letter = std.textureLoad(letterSourceLayout.$.source, insidePx, 0);
      return d.vec4f(letter.rgb, letter.a);
    },
  })
  .with(letterSourceBindGroup);
floodRunner.run();

const letterSdfView = floodRunner.sdfOutput.createView();

const COLOR_STOP_COUNT = 4;
const ColorStops = d.arrayOf(d.vec4f, COLOR_STOP_COUNT);
const COLOR_STOPS = ColorStops([
  d.vec4f(0.98, 0.16, 0.24, 1),
  d.vec4f(1, 0.72, 0.18, 1),
  d.vec4f(0.05, 0.72, 0.54, 1),
  d.vec4f(0.16, 0.36, 0.95, 1),
]);
const SCRIPT_PHASE_OPTIONS = [
  'flat colors',
  'place t',
  'remap t',
  'neighboring colors',
  'interpolation',
] as const;
const SCRIPT_PHASE_VALUES: Record<(typeof SCRIPT_PHASE_OPTIONS)[number], number> = {
  'flat colors': 0,
  'place t': 1,
  'remap t': 2,
  'neighboring colors': 3,
  interpolation: 4,
};

const interpolateColors = tgpu.fn(
  [d.f32, ColorStops],
  d.vec4f,
)((t, colors) => {
  'use gpu';
  const pos = std.fract(t) * colors.length;
  const idx = d.u32(std.floor(pos));
  const frac = std.fract(pos);

  const fromColor = d.vec4f(colors[idx]);
  const toColor = d.vec4f(colors[(idx + 1) % colors.length]);

  return std.mix(fromColor, toColor, frac);
});

const flatColor = tgpu.fn(
  [d.f32, ColorStops],
  d.vec4f,
)((t, colors) => {
  'use gpu';
  const pos = std.min(std.saturate(t), 0.9999) * colors.length;
  const idx = d.u32(std.floor(pos));

  return d.vec4f(colors[idx]);
});

const AnimationState = d.struct({
  t: d.f32,
  phase: d.f32,
  storyPhase: d.f32,
});

const animationUniform = root.createUniform(AnimationState, {
  t: 0,
  phase: 0,
  storyPhase: SCRIPT_PHASE_VALUES.interpolation,
});

const paint = (base: d.v4f, layer: d.v4f, alpha: number) => {
  'use gpu';
  return std.mix(base, layer, std.saturate(alpha));
};

const fillMask = (dist: number, aa: number) => {
  'use gpu';
  return 1 - std.smoothstep(-aa, aa, dist);
};

const drawLabel = (
  base: d.v4f,
  uv: d.v2f,
  center: d.v2f,
  size: d.v2f,
  layer: number,
  color: d.v3f,
  opacity: number,
) => {
  'use gpu';
  const labelUv = (uv - center) / size + 0.5;

  if (labelUv.x < 0 || labelUv.x > 1 || labelUv.y < 0 || labelUv.y > 1) {
    return d.vec4f(base);
  }

  const label = std.textureSampleLevel(
    labelTextureView.$,
    labelSampler.$,
    labelUv,
    d.i32(layer),
    0,
  );

  return paint(base, d.vec4f(color, 1), label.a * opacity);
};

const renderFn = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';

    const anim = animationUniform.$;
    const t = std.fract(anim.t);
    const pos = t * COLOR_STOP_COUNT;
    const leftIdx = d.u32(std.floor(pos));
    const nextIdx = (leftIdx + 1) % COLOR_STOP_COUNT;

    const axisStart = d.vec2f(0.12, 0.34);
    const axisEnd = d.vec2f(0.86, 0.34);
    const arrowEnd = d.vec2f(0.94, 0.34);
    const axis = std.normalize(axisEnd - axisStart);
    const axisLength = std.length(axisEnd - axisStart);
    const activeColor = interpolateColors(t, COLOR_STOPS);
    const showT = std.smoothstep(0.55, 0.95, anim.storyPhase);
    const remapScale = std.smoothstep(1.55, 1.95, anim.storyPhase);
    const showNeighborBlend = std.smoothstep(2.55, 2.95, anim.storyPhase);
    const showInterpolation = std.smoothstep(3.55, 3.95, anim.storyPhase);

    const fromActive = interpolateColors(d.f32(leftIdx) / COLOR_STOP_COUNT, COLOR_STOPS);
    const toActive = interpolateColors(d.f32(nextIdx) / COLOR_STOP_COUNT, COLOR_STOPS);

    let out = d.vec4f(std.mix(d.vec3f(0.985), d.vec3f(0.88, 0.93, 0.99), uv.y), 1);

    const arrowDist = sdArrow(uv, axisStart, arrowEnd, 0.005, d.vec2f(0.026, 0.055));
    out = paint(out, d.vec4f(0.08, 0.09, 0.11, 1), fillMask(arrowDist, 0.0012));

    const markerCenter = axisStart + axis * (axisLength * t);
    const leftT = d.f32(leftIdx) / COLOR_STOP_COUNT;
    const pairStart = axisStart + axis * (axisLength * leftT);
    const pairProgress = std.max(t - leftT, 0.001);
    const pairMarker = axisStart + axis * (axisLength * (leftT + pairProgress));
    const pairT = std.saturate(std.dot(uv - pairStart, axis) / (axisLength / COLOR_STOP_COUNT));
    const pairColor = std.mix(fromActive, toActive, pairT);
    const pairDist = sdf.sdLine(uv, pairStart, pairMarker) - 0.013;

    out = paint(
      out,
      d.vec4f(pairColor.rgb, 1),
      fillMask(pairDist, 0.0012) * 0.94 * showNeighborBlend,
    );

    for (const i of tgpu.unroll([0, 1, 2, 3, 4])) {
      const tickT = i / (AXIS_LABEL_COUNT - 1);
      const tickCenter = axisStart + axis * (axisLength * tickT);
      const labelCenter = tickCenter + d.vec2f(0, 0.064);
      const labelLift = d.vec2f(0, 0.012);
      out = drawLabel(
        out,
        uv,
        labelCenter + labelLift * remapScale,
        d.vec2f(0.118, 0.045),
        i,
        d.vec3f(0.08, 0.09, 0.11),
        0.78 * (d.f32(1) - remapScale),
      );
      out = drawLabel(
        out,
        uv,
        labelCenter - labelLift * (d.f32(1) - remapScale),
        d.vec2f(0.118, 0.045),
        REMAP_LABEL_LAYERS[i],
        d.vec3f(0.08, 0.09, 0.11),
        0.78 * remapScale,
      );
    }

    for (const i of tgpu.unroll([0, 1, 2, 3])) {
      const stopT = i / COLOR_STOP_COUNT;
      const stopCenter = axisStart + axis * (axisLength * stopT);
      const stopColor = interpolateColors(stopT, COLOR_STOPS);
      const stopIdx = d.u32(i % COLOR_STOP_COUNT);
      const isActive = leftIdx === stopIdx || nextIdx === stopIdx;
      const activeScale = std.select(d.f32(0), d.f32(1), isActive) * showNeighborBlend;
      const stopRadius = 0.018 + 0.009 * activeScale;
      const stopDist = sdf.sdDisk(uv - stopCenter, stopRadius);

      out = paint(out, d.vec4f(stopColor.rgb, 1), fillMask(stopDist, 0.0014));
    }

    const gradStart = d.vec2f(0.12, 0.66);
    const gradEnd = d.vec2f(0.88, 0.66);
    const gradAxis = std.normalize(gradEnd - gradStart);
    const gradLength = std.length(gradEnd - gradStart);
    const gradT = std.saturate(std.dot(uv - gradStart, gradAxis) / gradLength);
    const gradDist = sdf.sdLine(uv, gradStart, gradEnd) - 0.031;
    const flatGradColor = flatColor(gradT, COLOR_STOPS);
    const interpolatedGradColor = interpolateColors(gradT, COLOR_STOPS);
    const gradColor = std.mix(flatGradColor, interpolatedGradColor, showInterpolation);
    out = paint(out, d.vec4f(gradColor.rgb, 1), fillMask(gradDist, 0.0014));

    const gradSegmentStart =
      gradStart + gradAxis * (gradLength * (d.f32(leftIdx) / COLOR_STOP_COUNT));
    const gradMarker = gradStart + gradAxis * (gradLength * t);
    const segmentDist = sdf.sdLine(uv, gradSegmentStart, gradMarker) - 0.012;
    const segmentPulse = 0.72 + 0.28 * std.sin(anim.phase * 6.28318);
    out = paint(
      out,
      d.vec4f(1),
      fillMask(segmentDist, 0.0012) * 0.2 * segmentPulse * showNeighborBlend,
    );

    const letterCenter = markerCenter - d.vec2f(0, 0.12);
    const letterUv = (uv - letterCenter) / 0.112 + 0.5;

    if (letterUv.x >= 0 && letterUv.x <= 1 && letterUv.y >= 0 && letterUv.y <= 1) {
      const letterSdf =
        std.textureSampleLevel(letterSdfView.$, sampler.$, std.saturate(letterUv), 0).x - 0.006;
      const sdfTexel = 1 / d.f32(std.textureDimensions(letterSdfView.$).x);
      const edgeWidth = sdfTexel * 0.9;
      const letterAlpha = 1 - std.smoothstep(-edgeWidth, edgeWidth, letterSdf);
      const halo = 1 - std.smoothstep(0.002, 0.022, std.abs(letterSdf));

      out = paint(out, d.vec4f(activeColor.rgb, 1), halo * 0.16 * showT);
      out = paint(out, d.vec4f(activeColor.rgb, 1), letterAlpha * showT);
    }

    const markerDotDist = sdf.sdDisk(uv - markerCenter, 0.017);
    out = paint(out, d.vec4f(activeColor.rgb, 1), fillMask(markerDotDist, 0.0012) * showT);

    return d.vec4f(std.min(out.rgb, d.vec3f(1)), 1);
  },
});

function render() {
  syncCanvasSize();
  renderFn.withColorAttachment({ view: context }).draw(3);
}

let speed = 1;
let paused = false;
let storyPhase = SCRIPT_PHASE_VALUES.interpolation;
let targetStoryPhase = storyPhase;
let elapsed = 0;
let previousTime = performance.now();
let frameId = requestAnimationFrame(frame);

function smootherStep(x: number) {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function frame(now: number) {
  const deltaSeconds = (now - previousTime) / 1000;
  previousTime = now;

  storyPhase += (targetStoryPhase - storyPhase) * (1 - Math.exp(-deltaSeconds * 8));

  if (!paused) {
    elapsed += deltaSeconds * speed;
  }

  const segmentDuration = 1.8;
  const segmentPosition = elapsed / segmentDuration;
  const segmentBase = Math.floor(segmentPosition);
  const segmentIndex = segmentBase % COLOR_STOP_COUNT;
  const phase = segmentPosition - segmentBase;
  const local = Math.min(1, Math.max(0, (phase - 0.12) / 0.76));
  const eased = smootherStep(local);

  animationUniform.write({
    t: (segmentIndex + eased) / COLOR_STOP_COUNT,
    phase,
    storyPhase,
  });

  render();
  frameId = requestAnimationFrame(frame);
}

export const controls = defineControls({
  Phase: {
    initial: SCRIPT_PHASE_OPTIONS[4],
    options: SCRIPT_PHASE_OPTIONS,
    onSelectChange: (newValue) => {
      targetStoryPhase = SCRIPT_PHASE_VALUES[newValue];
    },
  },
  Speed: {
    min: 0.2,
    max: 2,
    step: 0.1,
    initial: speed,
    onSliderChange: (newValue) => {
      speed = newValue;
    },
  },
  Paused: {
    initial: paused,
    onToggleChange: (newValue) => {
      paused = newValue;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  floodRunner.destroy();
  root.destroy();
}

import { common, d, std, tgpu } from 'typegpu';
import * as sdf from '@typegpu/sdf';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const supported = root.enabledWgslLanguageFeatures.has('buffer_view');
(document.querySelector('#unsupported') as HTMLElement).hidden = supported;

const Motion = d.struct({ center: d.vec2f, orbit: d.f32, speed: d.f32, phase: d.f32 });
const Circle = d.struct({ color: d.u32, radius: d.f32, motion: Motion });
const Box = d.struct({ color: d.u32, halfSize: d.vec2f, motion: Motion });
const Segment = d.struct({ color: d.u32, width: d.f32, halfLength: d.f32, motion: Motion });
const Counts = d.struct({ circles: d.u32, boxes: d.u32, segments: d.u32 });

const Scene = (counts: d.Infer<typeof Counts>) =>
  d.struct({
    circles: d.arrayOf(Circle, counts.circles),
    boxes: d.arrayOf(Box, counts.boxes),
    segments: d.arrayOf(Segment, counts.segments),
  });

const layout = tgpu.bindGroupLayout({ scene: { storage: d.buffer } });
const counts = root.createUniform(Counts);
const time = root.createUniform(d.f32);
const smoothness = root.createUniform(d.f32, 0.12);

const colors = [
  d.vec3f(1, 0.42, 0.42),
  d.vec3f(1, 0.79, 0.34),
  d.vec3f(0.28, 0.86, 0.98),
  d.vec3f(0.11, 0.82, 0.63),
  d.vec3f(0.64, 0.61, 1),
  d.vec3f(1, 0.62, 0.95),
];
const palette = tgpu.const(d.arrayOf(d.vec3f, colors.length), colors);
const background = tgpu.const(d.vec3f, d.vec3f(0.07, 0.07, 0.09));

const Surface = d.struct({ dist: d.f32, color: d.vec3f });

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec2f(c * v.x + s * v.y, c * v.y - s * v.x);
};

const toLocal = (p: d.v2f, motion: d.Infer<typeof Motion>) => {
  'use gpu';
  const angle = time.$ * motion.speed + motion.phase;
  const center = motion.center + d.vec2f(std.cos(angle), std.sin(angle)) * motion.orbit;
  return rotate(p - center, angle);
};

const merge = (surface: d.Infer<typeof Surface>, dist: number, color: number) => {
  'use gpu';
  const k = std.max(smoothness.$, 0.0001);
  const h = std.saturate(0.5 + (0.5 * (surface.dist - dist)) / k);
  return Surface({
    dist: sdf.opSmoothUnion(surface.dist, dist, k),
    color: std.mix(surface.color, palette.$[color], h),
  });
};

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const p = (uv * 2 - 1) * d.vec2f(1, -1);
  const pixel = std.fwidth(p.x);

  const circlesSize = counts.$.circles * d.sizeOf(Circle);
  const boxesSize = counts.$.boxes * d.sizeOf(Box);
  const circles = std.bufferArrayView(d.arrayOf(Circle), layout.$.scene, 0, circlesSize);
  const boxes = std.bufferArrayView(d.arrayOf(Box), layout.$.scene, circlesSize, boxesSize);
  const segments = std.bufferView(d.arrayOf(Segment), layout.$.scene, circlesSize + boxesSize);

  let surface = Surface({ dist: 1000, color: background.$ });
  for (const circle of circles) {
    const dist = sdf.sdDisk(toLocal(p, circle.motion), circle.radius);
    surface = merge(surface, dist, circle.color);
  }
  for (const box of boxes) {
    const dist = sdf.sdRoundedBox2d(toLocal(p, box.motion), box.halfSize, 0.02);
    surface = merge(surface, dist, box.color);
  }
  for (const segment of segments) {
    const a = d.vec2f(-segment.halfLength, 0);
    const b = d.vec2f(segment.halfLength, 0);
    const dist = sdf.sdLine(toLocal(p, segment.motion), a, b) - segment.width;
    surface = merge(surface, dist, segment.color);
  }

  const fill = 1 - std.smoothstep(-pixel, pixel, surface.dist);
  const shade = surface.color * (0.8 + 0.2 * std.saturate(-surface.dist * 12));
  const rings = background.$ * (0.85 + 0.15 * std.cos(surface.dist * 90));
  return d.vec4f(std.mix(rings, shade, fill), 1);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
});

const random = (min: number, max: number) => min + Math.random() * (max - min);
const randomColor = () => Math.floor(Math.random() * colors.length);
const randomMotion = () => ({
  center: d.vec2f(random(-0.7, 0.7), random(-0.7, 0.7)),
  orbit: random(0.05, 0.25),
  speed: random(0.2, 0.8) * (Math.random() < 0.5 ? -1 : 1),
  phase: random(0, Math.PI * 2),
});

const circle = () => ({ color: randomColor(), radius: random(0.06, 0.16), motion: randomMotion() });

const box = () => {
  const size = random(0.06, 0.16);
  return { color: randomColor(), halfSize: d.vec2f(size, size * 0.6), motion: randomMotion() };
};

const segment = () => {
  const size = random(0.06, 0.16);
  return {
    color: randomColor(),
    width: size * 0.25,
    halfLength: size * 1.5,
    motion: randomMotion(),
  };
};

function createScene(shapeCount: number) {
  const third = Math.floor(shapeCount / 3);
  const sizes = { circles: shapeCount - 2 * third, boxes: third, segments: third };

  const buffer = root
    .createBuffer(Scene(sizes), {
      circles: Array.from({ length: sizes.circles }, circle),
      boxes: Array.from({ length: sizes.boxes }, box),
      segments: Array.from({ length: sizes.segments }, segment),
    })
    .$usage('storage');
  counts.write(sizes);
  return { buffer, bindGroup: root.createBindGroup(layout, { scene: buffer }) };
}

let shapeCount = 24;
let scene = createScene(shapeCount);

function regenerate() {
  scene.buffer.destroy();
  scene = createScene(shapeCount);
}

let frameId: number;

function frame(timestamp: number) {
  time.write(timestamp / 1000);
  pipeline.with(scene.bindGroup).withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}

if (supported) {
  frameId = requestAnimationFrame(frame);
}

// #region Example controls and cleanup

export const controls = defineControls({
  shapes: supported && {
    initial: shapeCount,
    min: 3,
    max: 60,
    step: 1,
    onSliderChange: (value) => {
      shapeCount = value;
      regenerate();
    },
  },
  smoothness: supported && {
    initial: 0.12,
    min: 0,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value) => {
      smoothness.write(value);
    },
  },
  'new scene': supported && {
    onButtonClick: regenerate,
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion

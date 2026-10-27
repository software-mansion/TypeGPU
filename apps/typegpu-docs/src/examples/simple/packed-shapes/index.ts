import { common, d, std, tgpu } from 'typegpu';
import * as sdf from '@typegpu/sdf';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const supported = root.enabledWgslLanguageFeatures.has('buffer_view');
(document.querySelector('#unsupported') as HTMLElement).hidden = supported;

const Kind = { end: 0, blend: 1, circle: 2, box: 3, segment: 4 } as const;

const Header = d.struct({ kind: d.u32, color: d.u32 });
const Blend = d.struct({ kind: d.u32, smoothness: d.f32 });
const Circle = d.struct({ center: d.vec2f, radius: d.f32 });
const Box = d.struct({ center: d.vec2f, halfSize: d.vec2f, angle: d.f32 });
const Segment = d.struct({ a: d.vec2f, b: d.vec2f, width: d.f32 });

const HEADER_SIZE = d.sizeOf(Header);
const BLEND_RECORD = d.sizeOf(Blend);
const CIRCLE_RECORD = HEADER_SIZE + d.sizeOf(Circle);
const BOX_RECORD = HEADER_SIZE + d.sizeOf(Box);
const SEGMENT_RECORD = HEADER_SIZE + d.sizeOf(Segment);

const STREAM_BYTES = 4096;
const commands = root.createReadonly(d.bytes(STREAM_BYTES));

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec2f(c * v.x + s * v.y, c * v.y - s * v.x);
};

const shapeDistance = tgpu.fn(
  [d.u32, d.u32, d.vec2f],
  d.f32,
)((kind, at, p) => {
  'use gpu';
  if (kind === Kind.circle) {
    const circle = std.bufferView(Circle, commands.$, at);
    return sdf.sdDisk(p - circle.center, circle.radius);
  }
  if (kind === Kind.box) {
    const box = std.bufferView(Box, commands.$, at);
    return sdf.sdRoundedBox2d(rotate(p - box.center, box.angle), box.halfSize, 0.02);
  }
  const segment = std.bufferView(Segment, commands.$, at);
  return sdf.sdLine(p, segment.a, segment.b) - segment.width;
});

const recordSize = tgpu.fn(
  [d.u32],
  d.u32,
)((kind) => {
  if (kind === Kind.circle) {
    return CIRCLE_RECORD;
  }
  if (kind === Kind.box) {
    return BOX_RECORD;
  }
  if (kind === Kind.segment) {
    return SEGMENT_RECORD;
  }
  if (kind === Kind.blend) {
    return BLEND_RECORD;
  }
  return HEADER_SIZE;
});

const background = d.vec3f(0.07, 0.07, 0.09);

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const p = (uv * 2 - 1) * d.vec2f(1, -1);
  const pixel = std.fwidth(p.x);

  let dist = d.f32(1000);
  let color = d.vec3f(background);
  let k = d.f32(0.0001);
  let offset = d.u32(0);
  const end = std.bufferLength(commands.$);

  while (offset < end) {
    const header = std.bufferView(Header, commands.$, offset);
    if (header.kind === Kind.end) {
      break;
    }

    if (header.kind === Kind.blend) {
      k = std.max(std.bufferView(Blend, commands.$, offset).smoothness, 0.0001);
    } else {
      const shape = shapeDistance(header.kind, offset + HEADER_SIZE, p);
      const h = std.saturate(0.5 + (0.5 * (dist - shape)) / k);
      dist = std.mix(dist, shape, h) - k * h * (1 - h);
      color = std.mix(color, std.unpack4x8unorm(header.color).xyz, h);
    }
    offset += recordSize(header.kind);
  }

  const fill = 1 - std.smoothstep(-pixel, pixel, dist);
  const shade = color * (0.8 + 0.2 * std.saturate(-dist * 12));
  const rings = background * (0.85 + 0.15 * std.cos(dist * 90));
  return d.vec4f(std.mix(rings, shade, fill), 1);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
});

const palette = [0xff6b6b, 0xfeca57, 0x48dbfb, 0x1dd1a1, 0xa29bfe, 0xff9ff3].map(
  (hex) => ((hex >> 16) | (hex & 0xff00) | ((hex & 0xff) << 16) | (0xff << 24)) >>> 0,
);

interface Shape {
  kind: typeof Kind.circle | typeof Kind.box | typeof Kind.segment;
  color: number;
  center: [number, number];
  orbit: number;
  speed: number;
  phase: number;
  size: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

let shapes: Shape[] = [];
let shapeCount = 24;
let smoothness = 0.12;

function generateScene() {
  shapes = Array.from({ length: shapeCount }, () => ({
    kind: ([Kind.circle, Kind.box, Kind.segment] as const)[Math.floor(Math.random() * 3)],
    color: palette[Math.floor(Math.random() * palette.length)],
    center: [random(-0.7, 0.7), random(-0.7, 0.7)],
    orbit: random(0.05, 0.25),
    speed: random(0.2, 0.8) * (Math.random() < 0.5 ? -1 : 1),
    phase: random(0, Math.PI * 2),
    size: random(0.06, 0.16),
  }));
}

const encoded = new ArrayBuffer(STREAM_BYTES);
const view = new DataView(encoded);

function encode(time: number) {
  let offset = 0;
  const header = (kind: number, word: number) => {
    view.setUint32(offset, kind, true);
    view.setUint32(offset + 4, word, true);
    offset += HEADER_SIZE;
  };
  const blend = (smoothness: number) => {
    view.setUint32(offset, Kind.blend, true);
    view.setFloat32(offset + 4, smoothness, true);
    offset += BLEND_RECORD;
  };
  const floats = (...values: number[]) => {
    values.forEach((value, i) => view.setFloat32(offset + i * 4, value, true));
  };

  shapes.forEach((shape, i) => {
    if (i % 6 === 0) {
      blend(smoothness * (0.5 + ((i / 6) % 3) * 0.5));
    }

    const angle = time * shape.speed + shape.phase;
    const x = shape.center[0] + Math.cos(angle) * shape.orbit;
    const y = shape.center[1] + Math.sin(angle) * shape.orbit;

    header(shape.kind, shape.color);
    if (shape.kind === Kind.circle) {
      floats(x, y, shape.size);
      offset += CIRCLE_RECORD - HEADER_SIZE;
    } else if (shape.kind === Kind.box) {
      floats(x, y, shape.size, shape.size * 0.6, angle);
      offset += BOX_RECORD - HEADER_SIZE;
    } else {
      const dx = Math.cos(angle * 2) * shape.size * 1.5;
      const dy = Math.sin(angle * 2) * shape.size * 1.5;
      floats(x - dx, y - dy, x + dx, y + dy, shape.size * 0.25);
      offset += SEGMENT_RECORD - HEADER_SIZE;
    }
  });

  header(Kind.end, 0);
}

let frameId: number;

function frame(timestamp: number) {
  encode(timestamp / 1000);
  commands.write(encoded);
  pipeline.withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}

generateScene();
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
      generateScene();
    },
  },
  smoothness: supported && {
    initial: smoothness,
    min: 0,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value) => {
      smoothness = value;
    },
  },
  'new scene': supported && {
    onButtonClick: generateScene,
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion

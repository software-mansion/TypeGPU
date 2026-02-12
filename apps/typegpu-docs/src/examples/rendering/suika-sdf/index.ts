import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import { type BallState, createPhysicsWorld } from './physics.ts';
import { createAtlases } from './sdf-gen.ts';
import { skyColor } from './sky.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const LEVEL_RADII = [0.12, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48];
const LEVEL_COUNT = LEVEL_RADII.length;
const LEVEL_SCALE = 1 / LEVEL_COUNT;
const MAX_LEVEL_RADIUS = LEVEL_RADII[LEVEL_COUNT - 1];
const WALL_DEFS = [
  { cx: 0, cy: -0.5, hw: 0.5, hh: 0.05 },
  { cx: 0.5, cy: 0, hw: 0.05, hh: 0.55 },
  { cx: -0.5, cy: 0, hw: 0.05, hh: 0.55 },
];
const WALL_COLOR = d.vec3f(0.55, 0.5, 0.45);
const MAX_FRUITS = 128;
const MIN_RADIUS = 0.001;
const EDGE_WIDTH = 0.003;
const OFFSCREEN = 10;
const DROP_Y = 0.65;
const SPAWN_WEIGHTS = [4, 3, 2, 1];
const SPAWN_WEIGHT_TOTAL = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
const MERGE_DISTANCE_FACTOR = 0.6;
const PLAYFIELD_HALF_WIDTH = 0.45;
const SPAWN_COOLDOWN = 0.35;
const GHOST_ALPHA = 0.45;

function clampSpawnX(x: number, radius: number) {
  return Math.max(
    -PLAYFIELD_HALF_WIDTH + radius,
    Math.min(PLAYFIELD_HALF_WIDTH - radius, x),
  );
}

const rotate2d = (p: d.v2f, angle: number) => {
  'use gpu';
  const cosA = std.cos(angle);
  const sinA = std.sin(angle);
  return d.vec2f(cosA * p.x - sinA * p.y, sinA * p.x + cosA * p.y);
};

const clampRadial = (p: d.v2f, clampRadius: number, minRadius: number) => {
  'use gpu';
  const len = std.max(std.length(p), minRadius);
  return p.mul(std.min(clampRadius / len, 1));
};

const atlasUv = (p: d.v2f, level: number, levelScale: number) => {
  'use gpu';
  const uv = d.vec2f(p.x + 0.5, 0.5 - p.y);
  const offset = level * levelScale;
  return d.vec2f(uv.x, uv.y * levelScale + offset);
};

const sampleSdf = (
  sdfView: d.texture2d<d.F32>,
  sampler: d.sampler,
  atlasUv: d.v2f,
  radius: number,
  localPos: d.v2f,
) => {
  'use gpu';
  const sdfEncoded = std.textureSample(sdfView, sampler, atlasUv).x;
  const sdfWorld = (sdfEncoded * 2 - 1) * radius;
  const outside = std.max(std.abs(localPos).sub(0.5), d.vec2f(0));
  const outsideDist = std.length(outside) * radius * 2;
  return sdfWorld + outsideDist;
};

const sampleSprite = (
  spriteView: d.texture2d<d.F32>,
  sampler: d.sampler,
  atlasUv: d.v2f,
) => {
  'use gpu';
  return std.textureSample(spriteView, sampler, atlasUv).xyz;
};

function randomLevel(): number {
  let r = Math.random() * SPAWN_WEIGHT_TOTAL;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    r -= SPAWN_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

interface ActiveFruit {
  level: number;
  radius: number;
  bodyIndex: number;
  dead: boolean;
}

let activeFruits: ActiveFruit[] = [];
let ghostLevel = randomLevel();
let ghostX = 0;
let lastSpawnTime = -Infinity;

const { spriteAtlas, sdfAtlas, contours } = await createAtlases();

const physics = await createPhysicsWorld(WALL_DEFS);

const spriteTexture = root['~unstable']
  .createTexture({
    size: [spriteAtlas.width, spriteAtlas.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
spriteTexture.write(spriteAtlas);
const spriteView = spriteTexture.createView();

const sdfTexture = root['~unstable']
  .createTexture({
    size: [sdfAtlas.width, sdfAtlas.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
sdfTexture.write(sdfAtlas);
const sdfView = sdfTexture.createView();

const SdRect = d.struct({ center: d.vec2f, size: d.vec2f });
const rectUniform = root.createUniform(
  d.arrayOf(SdRect, WALL_DEFS.length),
  WALL_DEFS.map((w) => ({
    center: d.vec2f(w.cx, w.cy),
    size: d.vec2f(w.hw * 2, w.hh * 2),
  })),
);

const wallColorUniform = root.createUniform(d.vec3f, WALL_COLOR);
const wallRoundnessUniform = root.createUniform(d.f32, 0.035);

const SdCircle = d.struct({
  center: d.vec2f,
  radius: d.f32,
  level: d.f32,
  angle: d.f32,
});
const INACTIVE_CIRCLE = {
  center: d.vec2f(OFFSCREEN, OFFSCREEN),
  radius: MIN_RADIUS,
  level: 0,
  angle: d.f32(0),
};
const circleUniform = root.createUniform(
  d.arrayOf(SdCircle, MAX_FRUITS),
  Array.from({ length: MAX_FRUITS }, () => INACTIVE_CIRCLE),
);
const ghostCircleUniform = root.createUniform(SdCircle, INACTIVE_CIRCLE);
const ghostAlphaUniform = root.createUniform(d.f32, GHOST_ALPHA);
const activeCountUniform = root.createUniform(d.u32, 0);
const timeUniform = root.createUniform(d.f32, 0);
const circleData = Array.from({ length: MAX_FRUITS }, () => INACTIVE_CIRCLE);
const frameStates: (BallState | null)[] = [];

const linSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderPipeline = root['~unstable'].createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
    const levelScale = d.f32(LEVEL_SCALE);
    const clampRadius = MAX_LEVEL_RADIUS;
    const activeCount = activeCountUniform.$;
    const time = timeUniform.$;
    const ghostCircle = ghostCircleUniform.$;
    const ghostAlpha = ghostAlphaUniform.$;
    const minRadius = MIN_RADIUS;
    const edge = EDGE_WIDTH;

    let closestDist = d.f32(2e10);
    let outColor = d.vec3f(0, 0, 0);

    const bgColor = skyColor(uv, ndc, time);

    for (let i = d.u32(0); i < activeCount; i++) {
      const circle = circleUniform.$[i];
      if (circle.radius < minRadius) continue;
      const raw = ndc.sub(circle.center).div(circle.radius * 2);
      const localPos = rotate2d(raw, -circle.angle);
      const clamped = clampRadial(localPos, clampRadius, minRadius);
      const sdfAtlasUv = atlasUv(clamped, circle.level, levelScale);
      const totalDist = sampleSdf(
        sdfView.$,
        linSampler.$,
        sdfAtlasUv,
        circle.radius,
        localPos,
      );
      const spriteRgb = sampleSprite(spriteView.$, linSampler.$, sdfAtlasUv);

      if (totalDist < closestDist) {
        closestDist = totalDist;
        outColor = d.vec3f(spriteRgb);
      }
    }

    const wc = wallColorUniform.$;
    const wallRoundness = wallRoundnessUniform.$;
    for (const rect of rectUniform.$) {
      const dist = sdf.sdRoundedBox2d(
        ndc.sub(rect.center),
        rect.size.mul(0.5),
        wallRoundness,
      );
      if (dist < closestDist) {
        closestDist = dist;
        const local = ndc.sub(rect.center);
        const stripe = std.abs(std.fract(local.x * 18.0 + local.y * 6.0) - 0.5);
        const stripeMask = std.clamp(0.55 - stripe * 1.6, 0, 1);
        const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) * 0.04;
        const texture = stripeMask * 0.08 + speck;
        const edgeShade = std.clamp(0.35 - dist * 12.0, 0, 0.35);
        outColor = d.vec3f(
          wc.x + edgeShade + texture,
          wc.y + edgeShade * 0.8 + texture * 0.8,
          wc.z + edgeShade * 0.6 + texture * 0.6,
        );
      }
    }

    const alpha = std.clamp(-closestDist, 0, edge) / edge;
    let finalColor = std.mix(bgColor, outColor, alpha);

    if (ghostCircle.radius > minRadius) {
      const gRaw = ndc.sub(ghostCircle.center).div(ghostCircle.radius * 2);
      const gLocalPos = rotate2d(gRaw, -ghostCircle.angle);
      const gClamped = clampRadial(gLocalPos, clampRadius, minRadius);
      const gAtlasUv = atlasUv(gClamped, ghostCircle.level, levelScale);
      const gRgb = sampleSprite(spriteView.$, linSampler.$, gAtlasUv);
      const gDist = sampleSdf(
        sdfView.$,
        linSampler.$,
        gAtlasUv,
        ghostCircle.radius,
        gLocalPos,
      );
      const gAlpha = (std.clamp(-gDist, 0, edge) / edge) * ghostAlpha;
      finalColor = std.mix(finalColor, gRgb, gAlpha);
    }

    return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1);
  },
  targets: { format: presentationFormat },
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ghostX = clampSpawnX(ndcX, LEVEL_RADII[ghostLevel]);
});

function markDead(fruit: ActiveFruit) {
  if (fruit.dead) return;
  fruit.dead = true;
  physics.removeBall(fruit.bodyIndex);
}

function spawnFruit(level: number, x: number, y = DROP_Y, vx = 0, vy = 0) {
  const radius = LEVEL_RADII[level];
  const bodyIndex = physics.addBall(
    x,
    y,
    radius,
    contours[level],
    level,
    vx,
    vy,
  );
  activeFruits.push({ level, radius, bodyIndex, dead: false });
}

function pruneDead() {
  activeFruits = activeFruits.filter((fruit) => !fruit.dead);
}

canvas.addEventListener('click', () => {
  const now = performance.now() * 0.001;
  if (now - lastSpawnTime < SPAWN_COOLDOWN) return;
  if (activeFruits.length >= MAX_FRUITS) return;
  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = randomLevel();
  ghostX = clampSpawnX(ghostX, LEVEL_RADII[ghostLevel]);
});

function checkMerges() {
  const maxLevel = LEVEL_COUNT - 1;
  const count = activeFruits.length;
  let merged = false;
  for (let i = 0; i < count; i++) {
    const a = activeFruits[i];
    if (a.dead || a.level >= maxLevel) continue;
    const sa = frameStates[i];
    if (!sa) continue;
    const mergeDist = a.radius * MERGE_DISTANCE_FACTOR;
    const mergeDistSq = mergeDist * mergeDist;

    for (let j = i + 1; j < count; j++) {
      const b = activeFruits[j];
      if (b.dead || a.level !== b.level) continue;
      const sb = frameStates[j];
      if (!sb) continue;

      const dx = sa.x - sb.x;
      const dy = sa.y - sb.y;
      if (dx * dx + dy * dy < mergeDistSq) {
        const newLevel = a.level + 1;

        markDead(a);
        markDead(b);

        const avgX = (sa.x + sb.x) * 0.5;
        const avgY = (sa.y + sb.y) * 0.5;
        const avgVx = (sa.vx + sb.vx) * 0.5;
        const avgVy = (sa.vy + sb.vy) * 0.5;
        spawnFruit(newLevel, avgX, avgY, avgVx, avgVy);
        merged = true;
        break;
      }
    }
  }
  return merged;
}

let lastTime = performance.now();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  timeUniform.write((now * 0.001) % 1000);

  physics.step(dt);
  frameStates.length = activeFruits.length;

  let drawCount = 0;

  for (let i = 0; i < activeFruits.length; i++) {
    const f = activeFruits[i];
    if (f.dead) {
      frameStates[i] = null;
      continue;
    }
    const state = physics.getBallState(f.bodyIndex);
    if (!state) {
      frameStates[i] = null;
      markDead(f);
      continue;
    }
    frameStates[i] = state;
    if (drawCount < MAX_FRUITS) {
      circleData[drawCount] = {
        center: d.vec2f(state.x, state.y),
        radius: f.radius,
        level: f.level,
        angle: state.angle,
      };
      drawCount++;
    }
  }

  circleData.fill(INACTIVE_CIRCLE, drawCount);

  activeCountUniform.write(drawCount);
  circleUniform.write(circleData);
  ghostCircleUniform.write({
    center: d.vec2f(ghostX, DROP_Y),
    radius: LEVEL_RADII[ghostLevel],
    level: ghostLevel,
    angle: d.f32(0),
  });

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    })
    .draw(3);

  if (checkMerges()) {
    pruneDead();
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

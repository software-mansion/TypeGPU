import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import { type BallState, createPhysicsWorld } from './physics.ts';
import { createAtlases } from './sdf-gen.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

// --- Level configuration ---

const LEVELS = [
  { radius: 0.12 },
  { radius: 0.16 },
  { radius: 0.2 },
  { radius: 0.24 },
  { radius: 0.28 },
  { radius: 0.32 },
  { radius: 0.36 },
  { radius: 0.4 },
  { radius: 0.44 },
  { radius: 0.48 },
];
const LEVEL_COUNT = LEVELS.length;
const LEVEL_SCALE = 1 / LEVEL_COUNT;
const WALL_DEFS = [
  { cx: 0, cy: -0.5, hw: 0.5, hh: 0.05 },
  { cx: 0.5, cy: 0, hw: 0.05, hh: 0.55 },
  { cx: -0.5, cy: 0, hw: 0.05, hh: 0.55 },
];
const WALL_COLOR = d.vec3f(0.55, 0.5, 0.45);
const MAX_FRUITS = 128;
const MAX_ACTIVE_FRUITS = MAX_FRUITS;
const DROP_Y = 0.65;
const SPAWN_WEIGHTS = [4, 3, 2, 1]; // levels 0–3, decreasing chance
const SPAWN_WEIGHT_TOTAL = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
const BLEND_K = 0.1; // smooth-min blend radius (world units)
const MERGE_DISTANCE_FACTOR = 0.6;
const PLAYFIELD_HALF_WIDTH = 0.45;
const SPAWN_COOLDOWN = 0.35;
const GHOST_ALPHA = 0.45;

function randomLevel(): number {
  let r = Math.random() * SPAWN_WEIGHT_TOTAL;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    r -= SPAWN_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

// --- Physics state ---

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

// --- Load sprite & SDF atlases, init physics ---

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

// --- GPU resources ---

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
  center: d.vec2f(10, 10),
  radius: 0.001,
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

// --- Render pipeline (all SDF logic in fragment shader) ---

const renderPipeline = root['~unstable'].createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
    const blendK = d.f32(BLEND_K);
    const levelScale = d.f32(LEVEL_SCALE);
    const clampRadius = d.f32(0.48);
    const activeCount = activeCountUniform.$;
    const time = timeUniform.$;
    const ghostCircle = ghostCircleUniform.$;
    const ghostAlpha = ghostAlphaUniform.$;

    let blendedDist = d.f32(2e10);
    let closestLevel = d.f32(-1);
    let outColor = d.vec3f(0, 0, 0);

    // Background: simple sky + sun + single scrolling hill
    const skyTop = d.vec3f(0.62, 0.86, 1.0);
    const skyBottom = d.vec3f(0.98, 0.93, 0.78);
    const skyMix = std.clamp(ndc.y * 0.5 + 0.5, d.f32(0), d.f32(1));
    let bgColor = std.mix(skyBottom, skyTop, skyMix);

    const sunPos = d.vec2f(0.78, 0.8);
    const sunDist = std.length(uv.sub(sunPos));
    const sunMask = std.clamp(
      (d.f32(0.1) - sunDist) * 40.0,
      d.f32(0),
      d.f32(1),
    );
    bgColor = std.mix(bgColor, d.vec3f(1.0, 0.95, 0.74), sunMask);

    const hillX = uv.x + time * 0.025;
    const hillLine = d.f32(0.2) + std.sin(hillX * 4.5) * 0.07 +
      std.sin(hillX * 1.8) * 0.04;
    const hillMask = std.clamp((hillLine - uv.y) * 50.0, d.f32(0), d.f32(1));
    bgColor = std.mix(bgColor, d.vec3f(0.41, 0.76, 0.46), hillMask);

    // Ball SDFs from atlas
    for (let i = d.u32(0); i < activeCount; i++) {
      const circle = circleUniform.$[i];
      if (circle.radius < d.f32(0.001)) continue;
      // Transform to local space and rotate by ball angle
      const raw = ndc.sub(circle.center).div(circle.radius * 2);
      const cosA = std.cos(-circle.angle);
      const sinA = std.sin(-circle.angle);
      const localPos = d.vec2f(
        cosA * raw.x - sinA * raw.y,
        sinA * raw.x + cosA * raw.y,
      );

      // --- 1) SDF sample: radially clamped for accurate distance ---
      const localLen = std.max(std.length(localPos), d.f32(0.001));
      const sdfPos = localPos * std.min(clampRadius / localLen, d.f32(1));
      const sdfUv = d.vec2f(sdfPos.x + 0.5, 0.5 - sdfPos.y);
      const atlasOffset = circle.level * levelScale;
      const sdfAtlasUv = d.vec2f(sdfUv.x, sdfUv.y * levelScale + atlasOffset);
      const sdfEncoded = std.textureSample(
        sdfView.$,
        linSampler.$,
        sdfAtlasUv,
      ).x;

      const sdfWorld = (sdfEncoded * 2 - 1) * circle.radius;
      const outside = std.max(std.abs(localPos).sub(0.5), d.vec2f(0));
      const outsideDist = std.length(outside) * circle.radius * 2;
      const totalDist = sdfWorld + outsideDist;

      // --- 2) Sprite sample (radially clamped) ---
      const colorUv = d.vec2f(sdfPos.x + 0.5, 0.5 - sdfPos.y);
      const colorAtlasUv = d.vec2f(
        colorUv.x,
        colorUv.y * levelScale + atlasOffset,
      );
      const spriteColor = std.textureSample(
        spriteView.$,
        linSampler.$,
        colorAtlasUv,
      );
      const spriteRgb = d.vec3f(spriteColor.x, spriteColor.y, spriteColor.z);

      const sameLevel = std.abs(circle.level - closestLevel) < 0.5;

      if (closestLevel < d.f32(0)) {
        blendedDist = totalDist;
        closestLevel = circle.level;
        outColor = d.vec3f(spriteRgb);
      } else if (sameLevel) {
        const diff = blendedDist - totalDist;
        const within = std.max(blendK - std.abs(diff), d.f32(0));
        if (within > d.f32(0)) {
          const h = std.clamp(
            d.f32(0.5) + (d.f32(0.5) * diff) / blendK,
            d.f32(0),
            d.f32(1),
          );
          blendedDist = std.mix(blendedDist, totalDist, h) -
            blendK * h * (d.f32(1) - h);
          outColor = std.mix(outColor, d.vec3f(spriteRgb), h);
        } else if (totalDist < blendedDist) {
          blendedDist = totalDist;
          outColor = d.vec3f(spriteRgb);
        }
      } else if (totalDist < blendedDist) {
        blendedDist = totalDist;
        closestLevel = circle.level;
        outColor = d.vec3f(spriteRgb);
      }
    }

    // Wall SDFs (rounded + simple shading)
    const wc = wallColorUniform.$;
    const wallRoundness = wallRoundnessUniform.$;
    for (const rect of rectUniform.$) {
      const dist = sdf.sdRoundedBox2d(
        ndc.sub(rect.center),
        rect.size.mul(0.5),
        wallRoundness,
      );
      if (dist < blendedDist) {
        blendedDist = dist;
        const local = ndc.sub(rect.center);
        const stripe = std.abs(
          std.fract(local.x * 18.0 + local.y * 6.0) - d.f32(0.5),
        );
        const stripeMask = std.clamp(
          d.f32(0.55) - stripe * 1.6,
          d.f32(0),
          d.f32(1),
        );
        const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) *
          d.f32(0.04);
        const texture = stripeMask * d.f32(0.08) + speck;
        const edgeShade = std.clamp(0.35 - dist * 12.0, d.f32(0), d.f32(0.35));
        outColor = d.vec3f(
          wc.x + edgeShade + texture,
          wc.y + edgeShade * 0.8 + texture * 0.8,
          wc.z + edgeShade * 0.6 + texture * 0.6,
        );
      }
    }

    const edge = d.f32(0.003);
    const alpha = std.clamp(-blendedDist, d.f32(0), edge) / edge;
    let finalColor = std.mix(bgColor, outColor, alpha);

    // Ghost preview: draw separately, no SDF union
    if (ghostCircle.radius > d.f32(0.001)) {
      const gRaw = ndc.sub(ghostCircle.center).div(ghostCircle.radius * 2);
      const gCosA = std.cos(-ghostCircle.angle);
      const gSinA = std.sin(-ghostCircle.angle);
      const gLocalPos = d.vec2f(
        gCosA * gRaw.x - gSinA * gRaw.y,
        gSinA * gRaw.x + gCosA * gRaw.y,
      );
      const gLen = std.max(std.length(gLocalPos), d.f32(0.001));
      const gSdfPos = gLocalPos * std.min(clampRadius / gLen, d.f32(1));
      const gUv = d.vec2f(gSdfPos.x + 0.5, 0.5 - gSdfPos.y);
      const gOffset = ghostCircle.level * levelScale;
      const gAtlasUv = d.vec2f(gUv.x, gUv.y * levelScale + gOffset);
      const gColor = std.textureSample(spriteView.$, linSampler.$, gAtlasUv);
      const gRgb = d.vec3f(gColor.x, gColor.y, gColor.z);
      const gOutside = std.max(std.abs(gLocalPos).sub(0.5), d.vec2f(0));
      const gOutsideDist = std.length(gOutside) * ghostCircle.radius * 2;
      const gEncoded = std.textureSample(sdfView.$, linSampler.$, gAtlasUv).x;
      const gWorld = (gEncoded * 2 - 1) * ghostCircle.radius;
      const gDist = gWorld + gOutsideDist;
      const gEdge = d.f32(0.003);
      const gAlpha = (std.clamp(-gDist, d.f32(0), gEdge) / gEdge) * ghostAlpha;
      finalColor = std.mix(finalColor, gRgb, gAlpha);
    }

    return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1);
  },
  targets: { format: presentationFormat },
});

// --- Input handling ---

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const r = LEVELS[ghostLevel].radius;
  ghostX = Math.max(
    -PLAYFIELD_HALF_WIDTH + r,
    Math.min(PLAYFIELD_HALF_WIDTH - r, ndcX),
  );
});

function markDead(fruit: ActiveFruit) {
  if (fruit.dead) return;
  fruit.dead = true;
  physics.removeBall(fruit.bodyIndex);
}

function spawnFruit(level: number, x: number, y = DROP_Y, vx = 0, vy = 0) {
  const radius = LEVELS[level].radius;
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
  if (activeFruits.length >= MAX_ACTIVE_FRUITS) return;
  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = randomLevel();
  const newRadius = LEVELS[ghostLevel].radius;
  ghostX = Math.max(
    -PLAYFIELD_HALF_WIDTH + newRadius,
    Math.min(PLAYFIELD_HALF_WIDTH - newRadius, ghostX),
  );
});

// --- Merge detection ---

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
        break; // one merge per fruit per frame
      }
    }
  }
  return merged;
}

// --- Frame loop ---

let lastTime = performance.now();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  timeUniform.write((now * 0.001) % 1000);

  physics.step(dt);
  frameStates.length = activeFruits.length;

  let drawCount = 0;

  // Active physics-driven fruits
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

  // Pad remaining slots (off-screen, invisible)
  for (let i = drawCount; i < MAX_FRUITS; i++) {
    circleData[i] = INACTIVE_CIRCLE;
  }

  activeCountUniform.write(drawCount);
  circleUniform.write(circleData);
  ghostCircleUniform.write({
    center: d.vec2f(ghostX, DROP_Y),
    radius: LEVELS[ghostLevel].radius,
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

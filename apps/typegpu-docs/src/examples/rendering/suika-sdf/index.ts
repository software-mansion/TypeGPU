import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import {
  DROP_Y,
  EDGE_WIDTH,
  GHOST_ALPHA,
  LEVEL_COUNT,
  LEVEL_RADII,
  MAX_FRUITS,
  MAX_LEVEL_RADIUS,
  MERGE_DISTANCE_FACTOR,
  MIN_RADIUS,
  OFFSCREEN,
  PLAYFIELD_HALF_WIDTH,
  SMOOTH_MIN_K,
  SPAWN_COOLDOWN,
  SPAWN_WEIGHT_TOTAL,
  SPAWN_WEIGHTS,
  WALL_COLOR,
  WALL_DEFS,
  WALL_ROUNDNESS,
} from './constants.ts';
import type { BallState } from './physics.ts';
import { createPhysicsWorld } from './physics.ts';
import { createAtlases, SPRITE_SIZE } from './sdf-gen.ts';
import { skyColor } from './sky.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const rotate2d = (p: d.v2f, angle: number) => {
  'use gpu';
  const cosA = std.cos(angle);
  const sinA = std.sin(angle);
  return d.vec2f(cosA * p.x - sinA * p.y, sinA * p.x + cosA * p.y);
};

const clampRadial = (p: d.v2f, clampRadius: number, minRadius: number) => {
  'use gpu';
  const len = std.max(std.length(p), minRadius);
  return p * std.min(clampRadius / len, 1);
};

const circleUv = (p: d.v2f) => {
  'use gpu';
  return d.vec2f(p.x + 0.5, 0.5 - p.y);
};

const uvToScene = (uv: d.v2f) => {
  'use gpu';
  return d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
};

const wallColor = (local: d.v2f, dist: number) => {
  'use gpu';
  const stripe = std.abs(std.fract(local.x * 18.0 + local.y * 6.0) - 0.5);
  const stripeMask = std.clamp(0.55 - stripe * 1.6, 0, 1);
  const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) * 0.04;
  const texture = stripeMask * 0.08 + speck;
  const edgeShade = std.clamp(0.35 - dist * 12.0, 0, 0.35);
  return WALL_COLOR + d.vec3f(1, 0.8, 0.6) * (edgeShade + texture);
};

interface ActiveFruit {
  level: number;
  radius: number;
  bodyIndex: number;
  dead: boolean;
}

function randomLevel(): number {
  let r = Math.random() * SPAWN_WEIGHT_TOTAL;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    r -= SPAWN_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

function clampSpawnX(x: number, radius: number) {
  return Math.max(
    -PLAYFIELD_HALF_WIDTH + radius,
    Math.min(PLAYFIELD_HALF_WIDTH - radius, x),
  );
}

let activeFruits: ActiveFruit[] = [];
let ghostLevel = randomLevel();
let ghostX = 0;
let lastSpawnTime = -Infinity;

const { spriteAtlas, sdfAtlas, contours } = await createAtlases();
const physics = await createPhysicsWorld(WALL_DEFS);

const spriteTexture = root['~unstable']
  .createTexture({
    size: [SPRITE_SIZE, SPRITE_SIZE, LEVEL_COUNT],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
spriteTexture.write(spriteAtlas);
const spriteView = spriteTexture.createView(d.texture2dArray());

const sdfTexture = root['~unstable']
  .createTexture({
    size: [SPRITE_SIZE, SPRITE_SIZE, LEVEL_COUNT],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
sdfTexture.write(sdfAtlas);
const sdfView = sdfTexture.createView(d.texture2dArray());

const mergedFieldTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'rgba16float',
  })
  .$usage('sampled', 'render');
const mergedFieldView = mergedFieldTexture.createView(d.texture2d());

const SdRect = d.struct({ center: d.vec2f, size: d.vec2f });
const rectUniform = root.createUniform(
  d.arrayOf(SdRect, WALL_DEFS.length),
  WALL_DEFS.map((w) => ({
    center: d.vec2f(w.cx, w.cy),
    size: d.vec2f(w.hw * 2, w.hh * 2),
  })),
);

const SdCircle = d.struct({
  center: d.vec2f,
  radius: d.f32,
  level: d.i32,
  angle: d.f32,
});
const INACTIVE_CIRCLE = {
  center: d.vec2f(OFFSCREEN, OFFSCREEN),
  radius: 0,
  level: 0,
  angle: 0,
};

const circleUniform = root.createUniform(
  d.arrayOf(SdCircle, MAX_FRUITS),
  Array.from({ length: MAX_FRUITS }, () => INACTIVE_CIRCLE),
);

const Frame = d.struct({
  ghostCircle: SdCircle,
  time: d.f32,
  activeCount: d.u32,
});
const frameUniform = root.createUniform(Frame, {
  ghostCircle: INACTIVE_CIRCLE,
  time: 0,
  activeCount: 0,
});

const circleData = Array.from(
  { length: MAX_FRUITS },
  () => ({ ...INACTIVE_CIRCLE }),
);
const frameStates: (BallState | null)[] = [];

const linSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const SceneHit = d.struct({ dist: d.f32, color: d.vec3f });

const sampleSdf = (
  uv: d.v2f,
  radius: number,
  localPos: d.v2f,
  level: number,
) => {
  'use gpu';
  const sdfEncoded = std.textureSample(sdfView.$, linSampler.$, uv, level).x;
  const sdfWorld = (sdfEncoded * 2 - 1) * radius;
  const outside = std.max(std.abs(localPos) - 0.5, d.vec2f(0));
  return sdfWorld + std.length(outside) * radius * 2;
};

const sampleSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  return std.textureSample(spriteView.$, linSampler.$, uv, level);
};

const sampleMergedField = (uv: d.v2f) => {
  'use gpu';
  return std.textureSample(mergedFieldView.$, linSampler.$, uv);
};

const blendSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  const sprite = sampleSprite(uv, level);
  const center = sampleSprite(d.vec2f(0.5, 0.5), level).xyz;
  return std.mix(center, sprite.xyz, sprite.w);
};

const evalFruits = (scenePos: d.v2f, activeCount: number) => {
  'use gpu';
  if (activeCount === 0) {
    return SceneHit({ dist: d.f32(2e10), color: d.vec3f(0, 0, 0) });
  }

  const screenUv = d.vec2f(scenePos.x * 0.5 + 0.5, 0.5 - scenePos.y * 0.5);

  const field = sampleMergedField(screenUv);
  const dist = field.x;
  const uv = d.vec2f(field.y, field.z);
  const levelIdx = d.i32(field.w);
  const spriteColor = blendSprite(uv, levelIdx);

  return SceneHit({ dist, color: d.vec3f(spriteColor) });
};

const evalWalls = (scenePos: d.v2f, hit: d.Infer<typeof SceneHit>) => {
  'use gpu';
  let closestDist = hit.dist;
  let outColor = d.vec3f(hit.color);
  for (const rect of rectUniform.$) {
    const dist = sdf.sdRoundedBox2d(
      scenePos - rect.center,
      rect.size * 0.5,
      WALL_ROUNDNESS,
    );
    if (dist < closestDist) {
      closestDist = dist;
      outColor = d.vec3f(wallColor(scenePos - rect.center, dist));
    }
  }
  return SceneHit({ dist: closestDist, color: outColor });
};

const applyGhost = (
  baseColor: d.v3f,
  ghost: d.Infer<typeof SdCircle>,
  scenePos: d.v2f,
) => {
  'use gpu';
  if (ghost.radius <= MIN_RADIUS) {
    return d.vec3f(baseColor);
  }
  const localPos = (scenePos - ghost.center) / (ghost.radius * 2);
  const clamped = clampRadial(localPos, MAX_LEVEL_RADIUS, MIN_RADIUS);
  const uv = circleUv(clamped);
  const dist = sampleSdf(uv, ghost.radius, localPos, ghost.level);
  const alpha = std.smoothstep(EDGE_WIDTH, 0, dist) * GHOST_ALPHA;
  const spriteColor = blendSprite(uv, ghost.level);
  return std.mix(baseColor, spriteColor, alpha);
};

// Render pipeline

const mergedFieldPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const scenePos = uvToScene(uv);
    const frame = frameUniform.$;

    let bestDist = d.f32(2e10);
    let bestLevel = d.f32(0);
    let bestUv = d.vec2f(0.5, 0.5);

    for (let level = d.i32(0); level < LEVEL_COUNT; level++) {
      let smoothAccum = d.f32(0);
      let uvAccum = d.vec2f(0, 0);
      let uvWeight = d.f32(0);

      for (let i = d.u32(0); i < frame.activeCount; i++) {
        const circle = circleUniform.$[i];
        if (circle.level !== level) {
          continue;
        }
        const raw = (scenePos - circle.center) / (circle.radius * 2);
        const localPos = rotate2d(raw, -circle.angle);
        const clamped = clampRadial(localPos, MAX_LEVEL_RADIUS, MIN_RADIUS);
        const uvLocal = circleUv(clamped);
        const dist = sampleSdf(uvLocal, circle.radius, localPos, circle.level);
        const weight = std.exp(-SMOOTH_MIN_K * dist);

        smoothAccum = smoothAccum + weight;
        uvAccum = uvAccum + uvLocal * weight;
        uvWeight = uvWeight + weight;
      }

      const safeSmooth = std.max(smoothAccum, d.f32(1e-6));
      const dist = -std.log(safeSmooth) / SMOOTH_MIN_K;
      const blendedUv = uvAccum / std.max(uvWeight, d.f32(1e-6));
      if (uvWeight > d.f32(0) && dist < bestDist) {
        bestDist = dist;
        bestLevel = d.f32(level);
        bestUv = d.vec2f(blendedUv);
      }
    }

    return d.vec4f(bestDist, bestUv.x, bestUv.y, bestLevel);
  },
  targets: { format: 'rgba16float' },
});

const renderPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const scenePos = uvToScene(uv);
    const frame = frameUniform.$;
    const bgColor = skyColor(uv, scenePos, frame.time);
    const hit = evalWalls(scenePos, evalFruits(scenePos, frame.activeCount));
    const alpha = std.smoothstep(EDGE_WIDTH, 0, hit.dist);
    const sceneColor = std.mix(bgColor, hit.color, alpha);
    return d.vec4f(applyGhost(sceneColor, frame.ghostCircle, scenePos), 1);
  },
  targets: { format: presentationFormat },
});

// Event handlers

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sceneX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ghostX = clampSpawnX(sceneX, LEVEL_RADII[ghostLevel]);
});

canvas.addEventListener('click', () => {
  const now = performance.now() * 0.001;
  if (now - lastSpawnTime < SPAWN_COOLDOWN) return;
  if (activeFruits.length >= MAX_FRUITS) return;
  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = randomLevel();
  ghostX = clampSpawnX(ghostX, LEVEL_RADII[ghostLevel]);
});

// Game logic

function markDead(fruit: ActiveFruit) {
  if (fruit.dead) return;
  fruit.dead = true;
  physics.removeBall(fruit.bodyIndex);
}

function spawnFruit(
  level: number,
  x: number,
  y = DROP_Y,
  vx = 0,
  vy = 0,
  angle = 0,
) {
  const radius = LEVEL_RADII[level];
  const bodyIndex = physics.addBall(
    x,
    y,
    radius,
    contours[level],
    level,
    vx,
    vy,
    angle,
  );
  activeFruits.push({ level, radius, bodyIndex, dead: false });
}

function pruneDead() {
  activeFruits = activeFruits.filter((fruit) => !fruit.dead);
}

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

    for (let j = i + 1; j < count; j++) {
      const b = activeFruits[j];
      if (b.dead || a.level !== b.level) continue;
      const sb = frameStates[j];
      if (!sb) continue;

      const dx = sa.pos.x - sb.pos.x;
      const dy = sa.pos.y - sb.pos.y;
      if (dx * dx + dy * dy < mergeDist * mergeDist) {
        markDead(a);
        markDead(b);
        spawnFruit(
          a.level + 1,
          (sa.pos.x + sb.pos.x) * 0.5,
          (sa.pos.y + sb.pos.y) * 0.5,
          (sa.vel.x + sb.vel.x) * 0.5,
          (sa.vel.y + sb.vel.y) * 0.5,
          Math.atan2(
            Math.sin(sa.angle) + Math.sin(sb.angle),
            Math.cos(sa.angle) + Math.cos(sb.angle),
          ),
        );
        merged = true;
        break;
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
  }

  for (let i = 0; i < activeFruits.length; i++) {
    const f = activeFruits[i];
    const state = frameStates[i];
    if (!state) {
      continue;
    }
    if (drawCount >= MAX_FRUITS) {
      break;
    }

    circleData[drawCount] = {
      center: d.vec2f(state.pos.x, state.pos.y),
      radius: f.radius,
      level: f.level,
      angle: state.angle,
    };
    drawCount++;
  }

  circleUniform.write(circleData);
  frameUniform.write({
    time: (now * 0.001) % 1000,
    activeCount: drawCount,
    ghostCircle: {
      center: d.vec2f(ghostX, DROP_Y),
      radius: LEVEL_RADII[ghostLevel],
      level: ghostLevel,
      angle: 0,
    },
  });

  mergedFieldPipeline
    .withColorAttachment({
      view: mergedFieldView,
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    })
    .draw(3);

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

import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import {
  DROP_Y,
  GAME_ASPECT,
  GHOST_ALPHA,
  LEVEL_COUNT,
  LEVEL_RADII,
  MAX_FRUITS,
  MAX_LEVEL_RADIUS,
  MERGE_DISTANCE_FACTOR,
  MIN_RADIUS,
  OFFSCREEN,
  PLAYFIELD_HALF_WIDTH,
  SCENE_SCALE,
  SHARP_FACTOR,
  SMOOTH_MIN_K,
  SPAWN_COOLDOWN,
  SPAWN_WEIGHT_TOTAL,
  SPAWN_WEIGHTS,
  SPEED_BLEND_MAX,
  WALL_COLOR,
  WALL_DEFS,
  WALL_ROUNDNESS,
} from './constants.ts';
import type { BallState } from './physics.ts';
import { createPhysicsWorld } from './physics.ts';
import { createAtlases, SPRITE_SIZE } from './sdf-gen.ts';
import { createSmoothedSdf } from './sdf-smooth.ts';
import { bucketBg, computeDaylight, skyColor } from './sky.ts';
import { defineControls } from '../../common/defineControls.ts';

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
  return d.vec2f((uv.x * 2 - 1) * SCENE_SCALE, (1 - uv.y * 2) * SCENE_SCALE);
};

const canvasToGameUv = (uv: d.v2f, canvasAspect: number) => {
  'use gpu';
  const scale = std.select(
    d.vec2f(1, canvasAspect / GAME_ASPECT),
    d.vec2f(GAME_ASPECT / canvasAspect, 1),
    canvasAspect > GAME_ASPECT,
  );
  const offset = (d.vec2f(1) - scale) * 0.5;
  return (uv - offset) / scale;
};

const wallColor = (local: d.v2f, dist: number, daylight: number) => {
  'use gpu';
  const stripe = std.abs(std.fract(local.x * 18.0 + local.y * 6.0) - 0.5);
  const stripeMask = std.clamp(0.55 - stripe * 1.6, 0, 1);
  const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) * 0.04;
  const texture = stripeMask * 0.08 + speck;
  const edgeShade = std.clamp(0.35 - dist * 12.0, 0, 0.35);
  const baseColor = WALL_COLOR + d.vec3f(1, 0.8, 0.6) * (edgeShade + texture);
  return std.mix(baseColor * 0.12, baseColor, daylight);
};

interface ActiveFruit {
  level: number;
  radius: number;
  bodyIndex: number;
  dead: boolean;
  spawnTime: number;
  isMerge: boolean;
}

function randomLevel(): number {
  let r = Math.random() * SPAWN_WEIGHT_TOTAL;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    r -= SPAWN_WEIGHTS[i];
    if (r <= 0) {
      return i;
    }
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
let bgTime = 20;
let timeScale = 1;

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
    format: 'rgba16float',
  })
  .$usage('sampled', 'render');
sdfTexture.write(sdfAtlas);

const linSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const smoothSdfReadView = createSmoothedSdf(root, sdfTexture, linSampler);

const mergedFieldLayout = tgpu.bindGroupLayout({
  mergedField: { texture: d.texture2d(d.f32) },
});

function createMergedFieldResources() {
  return root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'rgba16float',
    })
    .$usage('sampled', 'render');
}

let mergedFieldTexture = createMergedFieldResources();
let mergedFieldView = mergedFieldTexture.createView(d.texture2d());
let mergedFieldBindGroup = root.createBindGroup(mergedFieldLayout, {
  mergedField: mergedFieldView,
});

const SdRect = d.struct({ center: d.vec2f, size: d.vec2f });
const rectUniform = root.createUniform(
  d.arrayOf(SdRect, WALL_DEFS.length),
  WALL_DEFS.map((w) => ({
    center: d.vec2f(w.cx, w.cy),
    size: d.vec2f(w.hw * 2, w.hh * 2),
  })),
);

const SdCircle = d.struct({
  center: d.align(16, d.vec2f),
  radius: d.f32,
  level: d.i32,
  angle: d.f32,
  speed: d.f32,
});
const INACTIVE_CIRCLE = {
  center: d.vec2f(OFFSCREEN, OFFSCREEN),
  radius: 0,
  level: 0,
  angle: 0,
  speed: 0,
};

const circleUniform = root.createUniform(
  d.arrayOf(SdCircle, MAX_FRUITS),
  Array.from({ length: MAX_FRUITS }, () => INACTIVE_CIRCLE),
);

const Frame = d.struct({
  time: d.f32,
  canvasAspect: d.f32,
  activeCount: d.u32,
  ghostCircle: SdCircle,
});
const frameUniform = root.createUniform(Frame, {
  ghostCircle: INACTIVE_CIRCLE,
  time: 0,
  canvasAspect: 1,
  activeCount: 0,
});

const circleData = Array.from(
  { length: MAX_FRUITS },
  () => ({ ...INACTIVE_CIRCLE }),
);
const frameStates: (BallState | null)[] = [];

const SceneHit = d.struct({ dist: d.f32, color: d.vec3f });

const sampleSdf = (
  uv: d.v2f,
  radius: number,
  localPos: d.v2f,
  level: number,
) => {
  'use gpu';
  const sdfEncoded = std.textureSampleLevel(
    smoothSdfReadView.$,
    linSampler.$,
    uv,
    level,
    d.f32(0),
  ).x;
  const sdfWorld = (sdfEncoded * 2 - 1) * radius;
  const outside = std.max(std.abs(localPos) - 0.5, d.vec2f());
  return sdfWorld + std.length(outside) * radius * 2;
};

const sampleSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  return std.textureSampleLevel(
    spriteView.$,
    linSampler.$,
    uv,
    level,
    d.f32(0),
  );
};

const blendSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  const sprite = sampleSprite(uv, level);
  const center = sampleSprite(d.vec2f(0.5), level).xyz;
  return std.mix(center, sprite.xyz, sprite.w);
};

const evalFruits = (field: d.v4f, activeCount: number) => {
  'use gpu';
  if (activeCount === 0) {
    return SceneHit({ dist: d.f32(2e10), color: d.vec3f() });
  }
  return SceneHit({
    dist: field.x,
    color: d.vec3f(blendSprite(field.yz, d.i32(field.w))),
  });
};

const evalWalls = (
  scenePos: d.v2f,
  hit: d.Infer<typeof SceneHit>,
  daylight: number,
) => {
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
      outColor = d.vec3f(wallColor(scenePos - rect.center, dist, daylight));
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
  const alpha = std.smoothstep(std.fwidth(scenePos.x), 0, dist) * GHOST_ALPHA;
  const spriteColor = blendSprite(uv, ghost.level);
  return std.mix(baseColor, spriteColor, alpha);
};

// Render pipeline

const LEVEL_F32_ZEROS = Array.from({ length: LEVEL_COUNT }, () => 0);
const LEVEL_V2F_ZEROS = Array.from({ length: LEVEL_COUNT }, () => d.vec2f());

const mergedFieldPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const frame = frameUniform.$;
    const gameUv = canvasToGameUv(uv, frame.canvasAspect);
    const scenePos = uvToScene(gameUv);

    let bestDist = d.f32(2e10);
    let bestLevel = d.f32(0);
    let bestUv = d.vec2f(0.5);

    let smoothAccum = d.arrayOf(d.f32, LEVEL_COUNT)(LEVEL_F32_ZEROS);
    let uvAccum = d.arrayOf(d.vec2f, LEVEL_COUNT)(LEVEL_V2F_ZEROS);
    let uvWeight = d.arrayOf(d.f32, LEVEL_COUNT)(LEVEL_F32_ZEROS);

    for (let i = d.u32(0); i < frame.activeCount; i++) {
      const circle = circleUniform.$[i];
      const k = SMOOTH_MIN_K * (1 + (1 - circle.speed) * SHARP_FACTOR);
      // exp(-k * dist) < 1e-3 beyond this threshold
      if ((std.length(scenePos - circle.center) - circle.radius) * k > 7.0) {
        continue;
      }
      const raw = (scenePos - circle.center) / (circle.radius * 2);
      const localPos = rotate2d(raw, -circle.angle);
      const clamped = clampRadial(localPos, MAX_LEVEL_RADIUS, MIN_RADIUS);
      const uvLocal = circleUv(clamped);
      const dist = sampleSdf(uvLocal, circle.radius, localPos, circle.level);
      const weight = std.exp(-k * dist);
      const lv = circle.level;
      smoothAccum[lv] += weight;
      uvAccum[lv] += uvLocal * weight;
      uvWeight[lv] += weight;
    }

    for (let level = d.i32(0); level < LEVEL_COUNT; level++) {
      const safeSmooth = std.max(smoothAccum[level], d.f32(1e-6));
      const dist = -std.log(safeSmooth) / SMOOTH_MIN_K;
      const blendedUv = uvAccum[level] / std.max(uvWeight[level], d.f32(1e-6));
      if (uvWeight[level] > d.f32(0) && dist < bestDist) {
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
    const frame = frameUniform.$;
    const gameUv = canvasToGameUv(uv, frame.canvasAspect);
    const scenePos = uvToScene(gameUv);
    const daylight = computeDaylight(frame.time);

    const xInside = std.smoothstep(0.52, 0.48, std.abs(scenePos.x));
    const yAboveFloor = std.smoothstep(-0.55, -0.5, scenePos.y);
    const yBelowTop = std.smoothstep(0.52, 0.48, scenePos.y);
    const bucketMask = xInside * yAboveFloor * yBelowTop;

    let bg = std.mix(
      skyColor(gameUv, daylight, frame.time),
      bucketBg(scenePos, daylight),
      bucketMask,
    );

    // Merged field: sampled once for both fruit hit and glow
    const field = std.textureSampleLevel(
      mergedFieldLayout.$.mergedField,
      linSampler.$,
      uv,
      d.f32(0),
    );
    // Fruit glow on bucket interior back wall
    bg += blendSprite(d.vec2f(0.2), d.i32(field.w)) *
      std.exp(-std.max(field.x, 0) * 12) * bucketMask * 0.4;

    const hit = evalWalls(
      scenePos,
      evalFruits(field, frame.activeCount),
      daylight,
    );
    const alpha = std.smoothstep(std.fwidth(scenePos.x), 0, hit.dist);
    const sceneColor = std.mix(bg, hit.color, alpha);
    return d.vec4f(applyGhost(sceneColor, frame.ghostCircle, scenePos), 1);
  },
  targets: { format: presentationFormat },
});

const resizeObserver = new ResizeObserver(() => {
  mergedFieldTexture.destroy();
  mergedFieldTexture = createMergedFieldResources();
  mergedFieldView = mergedFieldTexture.createView(d.texture2d());
  mergedFieldBindGroup = root.createBindGroup(mergedFieldLayout, {
    mergedField: mergedFieldView,
  });
});
resizeObserver.observe(canvas);

// Event handlers

canvas.addEventListener('touchstart', (e) => e.preventDefault(), {
  passive: false,
});
canvas.addEventListener('touchmove', (e) => e.preventDefault(), {
  passive: false,
});
canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

function pointerToSceneX(clientX: number, rect: DOMRect): number {
  const uvX = (clientX - rect.left) / rect.width;
  const aspect = canvas.width / canvas.height;
  const scaleX = aspect > GAME_ASPECT ? GAME_ASPECT / aspect : 1;
  const offsetX = (1 - scaleX) / 2;
  return (((uvX - offsetX) / scaleX) * 2 - 1) * SCENE_SCALE;
}

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sceneX = pointerToSceneX(e.clientX, rect);
  ghostX = clampSpawnX(sceneX, LEVEL_RADII[ghostLevel]);
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  if (!touch) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const sceneX = pointerToSceneX(touch.clientX, rect);
  ghostX = clampSpawnX(sceneX, LEVEL_RADII[ghostLevel]);
  const now = performance.now() * 0.001;
  if (now - lastSpawnTime < SPAWN_COOLDOWN) {
    return;
  }
  if (activeFruits.length >= MAX_FRUITS) {
    return;
  }
  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = randomLevel();
  ghostX = clampSpawnX(ghostX, LEVEL_RADII[ghostLevel]);
});

canvas.addEventListener('click', () => {
  const now = performance.now() * 0.001;

  if (
    now - lastSpawnTime < SPAWN_COOLDOWN ||
    activeFruits.length >= MAX_FRUITS
  ) {
    return;
  }

  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = randomLevel();
  ghostX = clampSpawnX(ghostX, LEVEL_RADII[ghostLevel]);
});

// Game logic

function markDead(fruit: ActiveFruit) {
  if (fruit.dead) {
    return;
  }
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
  isMerge = false,
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
  activeFruits.push({
    level,
    radius,
    bodyIndex,
    dead: false,
    spawnTime: performance.now(),
    isMerge,
  });
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
    if (a.dead || a.level >= maxLevel) {
      continue;
    }
    const sa = frameStates[i];
    if (!sa) {
      continue;
    }
    const mergeDist = a.radius * MERGE_DISTANCE_FACTOR;

    for (let j = i + 1; j < count; j++) {
      const b = activeFruits[j];
      if (b.dead || a.level !== b.level) {
        continue;
      }
      const sb = frameStates[j];
      if (!sb) {
        continue;
      }

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
          true,
        );
        merged = true;
        break;
      }
    }
  }
  return merged;
}

function restart() {
  for (const fruit of activeFruits) {
    if (!fruit.dead) {
      physics.removeBall(fruit.bodyIndex);
    }
  }
  activeFruits = [];
  frameStates.length = 0;
  ghostLevel = randomLevel();
  ghostX = 0;
  lastSpawnTime = -Infinity;
  for (let i = 0; i < MAX_FRUITS; i++) {
    circleData[i] = { ...INACTIVE_CIRCLE };
  }
  circleUniform.write(circleData);
}

let lastTime = 0;

function frame(now: number) {
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

    if (drawCount >= MAX_FRUITS) {
      continue;
    }

    let speed = Math.min(
      Math.sqrt(state.vel.x ** 2 + state.vel.y ** 2) / SPEED_BLEND_MAX,
      1,
    );
    let visualRadius = f.radius;

    if (f.isMerge) {
      const t = Math.min((now - f.spawnTime) / 500, 1);
      const p = 0.4;
      const ease =
        Math.pow(2, -9 * t) * Math.sin(((t - p / 4) * 2 * Math.PI) / p) + 1;
      visualRadius = f.radius * ease;
      speed = Math.max(speed, 1 - t * t);
    }

    circleData[drawCount] = {
      center: d.vec2f(state.pos.x, state.pos.y),
      radius: visualRadius,
      level: f.level,
      angle: state.angle,
      speed,
    };
    drawCount++;
  }

  bgTime = (bgTime + dt * timeScale + 1000) % 1000;

  circleUniform.write(circleData);
  frameUniform.write({
    time: bgTime,
    canvasAspect: canvas.width / canvas.height,
    activeCount: drawCount,
    ghostCircle: {
      center: d.vec2f(ghostX, DROP_Y),
      radius: LEVEL_RADII[ghostLevel],
      level: ghostLevel,
      angle: 0,
      speed: 0,
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
    .with(mergedFieldBindGroup)
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

export const controls = defineControls({
  'Restart': {
    onButtonClick: restart,
  },
  'Time Scale': {
    initial: 1,
    min: -1,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      timeScale = value;
    },
  },
});

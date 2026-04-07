import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import {
  DROP_Y,
  ESCAPE_BOTTOM_Y,
  ESCAPE_X,
  GAME_ASPECT,
  GHOST_ALPHA,
  LEVEL_COUNT,
  LEVEL_RADII,
  LOSE_LINE_HALF_THICKNESS,
  LOSE_LINE_Y,
  LOSE_TIMEOUT_MS,
  MAX_FRUITS,
  MAX_LEVEL_RADIUS,
  MERGE_DISTANCE_FACTOR,
  MERGE_SCORES,
  MIN_RADIUS,
  PHYSICS_WALL_DEFS,
  PLAYFIELD_HALF_WIDTH,
  PULL_ACTIVATION_FACTOR,
  PULL_FORCE,
  SCENE_SCALE,
  SHARP_FACTOR,
  SMOOTH_MIN_K,
  SPAWN_COOLDOWN,
  SPAWN_WEIGHT_TOTAL,
  SPAWN_WEIGHTS,
  SPEED_BLEND_MAX,
  WARNING_FLASH_SPEED,
  WALL_DEFS,
  WALL_ROUNDNESS,
} from './constants.ts';
import { type BallState, createPhysicsWorld } from './physics.ts';
import { createAtlases, createSmoothedSdf, SPRITE_SIZE } from './sdfGen.ts';
import { bucketBg, computeDaylight, skyColor } from './sky.ts';
import type { ActiveFruit } from './schemas.ts';
import {
  Frame,
  INACTIVE_CIRCLE,
  LEVEL_F32_ZEROS,
  LEVEL_V2F_ZEROS,
  SceneHit,
  SdCircle,
  SdRect,
} from './schemas.ts';
import {
  canvasToGameUv,
  circleUv,
  clampRadial,
  rotate2d,
  uvToScene,
  wallColor,
} from './shaderHelpers.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const cleanupController = new AbortController();
const { signal } = cleanupController;

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
    -PLAYFIELD_HALF_WIDTH + radius * 0.5,
    Math.min(PLAYFIELD_HALF_WIDTH - radius * 0.5, x),
  );
}

let activeFruits: ActiveFruit[] = [];
let ghostLevel = randomLevel();
let nextGhostLevel = randomLevel();
let ghostX = 0;
let lastSpawnTime = -Infinity;
let bgTime = 20;
let timeScale = 1;
let score = 0;
let isGameOver = false;

const scoreEl = document.getElementById('score') as HTMLElement;
const finalScoreEl = document.getElementById('final-score') as HTMLElement;
const loseScreenEl = document.getElementById('lose-screen') as HTMLElement;
const resetButtonEl = document.getElementById('reset-button') as HTMLButtonElement;
const attributionEl = document.getElementById('attribution') as HTMLElement;

const dismissAttribution = () => {
  attributionEl.style.opacity = '0';
  attributionEl.style.pointerEvents = 'none';
};
canvas.addEventListener('click', dismissAttribution, { once: true, signal });
canvas.addEventListener('touchend', dismissAttribution, { once: true, signal });
resetButtonEl.addEventListener('click', restart, { signal });

function triggerGameOver() {
  if (isGameOver) {
    return;
  }
  isGameOver = true;
  finalScoreEl.textContent = String(score);
  loseScreenEl.hidden = false;
}

function computeDangerStrength(now: number, startTime: number | null): number {
  if (startTime === null) {
    return 0;
  }
  const elapsed = now - startTime;
  const progress = Math.min(elapsed / LOSE_TIMEOUT_MS, 1);
  const flash = 0.5 + 0.5 * Math.sin(now * WARNING_FLASH_SPEED);
  return (0.3 + 0.7 * progress) * (0.35 + 0.65 * flash);
}

function isFruitEscaped(state: BallState): boolean {
  return Math.abs(state.pos.x) > ESCAPE_X || state.pos.y < ESCAPE_BOTTOM_Y;
}

const { spriteAtlas, sdfAtlas, contours } = await createAtlases();
const physics = await createPhysicsWorld(PHYSICS_WALL_DEFS);

const spriteTexture = root
  .createTexture({
    size: [SPRITE_SIZE, SPRITE_SIZE, LEVEL_COUNT],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
spriteTexture.write(spriteAtlas);
const spriteView = spriteTexture.createView(d.texture2dArray());

const sdfTexture = root
  .createTexture({
    size: [SPRITE_SIZE, SPRITE_SIZE, LEVEL_COUNT],
    format: 'rgba16float',
  })
  .$usage('sampled', 'render');
sdfTexture.write(sdfAtlas);

const linSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const nearSampler = root.createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});

const smoothSdfReadView = createSmoothedSdf(root, sdfTexture, linSampler);

const mergedFieldLayout = tgpu.bindGroupLayout({
  distance: { texture: d.texture2d() },
  info: { texture: d.texture2d() },
});

function createMergedFieldResources() {
  const size = [canvas.width, canvas.height].map((v) => Math.ceil(v / 2)) as [number, number];
  return {
    distance: root.createTexture({ size, format: 'r16float' }).$usage('sampled', 'render'),
    info: root.createTexture({ size, format: 'rgba16float' }).$usage('sampled', 'render'),
  };
}

let mergedField = createMergedFieldResources();
let distanceView = mergedField.distance.createView(d.texture2d());
let infoView = mergedField.info.createView(d.texture2d());
let mergedFieldBindGroup = root.createBindGroup(mergedFieldLayout, {
  distance: distanceView,
  info: infoView,
});

const rectUniform = root.createUniform(
  d.arrayOf(SdRect, WALL_DEFS.length),
  WALL_DEFS.map((w) => ({
    center: d.vec2f(w.cx, w.cy),
    size: d.vec2f(w.hw * 2, w.hh * 2),
  })),
);

const circleUniform = root.createUniform(
  d.arrayOf(SdCircle, MAX_FRUITS),
  Array.from({ length: MAX_FRUITS }, () => INACTIVE_CIRCLE),
);

const frameUniform = root.createUniform(Frame, {
  ghostCircle: INACTIVE_CIRCLE,
  time: 0,
  canvasAspect: 1,
  activeCount: 0,
  nextLevel: 0,
});

const circleData = Array.from({ length: MAX_FRUITS }, () => ({ ...INACTIVE_CIRCLE }));

const sampleSdf = (uv: d.v2f, radius: number, localPos: d.v2f, level: number) => {
  'use gpu';
  const sdfEncoded = std.textureSampleLevel(smoothSdfReadView.$, linSampler.$, uv, level, 0).x;
  const sdfWorld = (sdfEncoded * 2 - 1) * radius;
  const outside = std.max(std.length(localPos) - 0.5, 0);
  return sdfWorld + outside * radius * 2;
};

const sampleSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  return std.textureSampleLevel(spriteView.$, linSampler.$, uv, level, 0);
};

const blendSprite = (uv: d.v2f, level: number) => {
  'use gpu';
  const sprite = sampleSprite(uv, level);
  const center = sampleSprite(d.vec2f(0.5), level).xyz;
  return std.mix(center, sprite.xyz, sprite.w);
};

const evalFruits = (bestDist: number, info: d.v4f, activeCount: number) => {
  'use gpu';
  if (activeCount === 0) {
    return SceneHit({ dist: 2e10, color: d.vec3f() });
  }
  let color = blendSprite(info.xy, d.i32(info.z));
  color = std.mix(color, d.vec3f(1, 0.12, 0.1), info.w * 0.78);
  return SceneHit({ dist: bestDist, color });
};

const evalWalls = (scenePos: d.v2f, hit: d.Infer<typeof SceneHit>, daylight: number) => {
  'use gpu';
  let closestDist = hit.dist;
  let outColor = d.vec3f(hit.color);
  for (const rect of rectUniform.$) {
    const dist = sdf.sdRoundedBox2d(scenePos - rect.center, rect.size * 0.5, WALL_ROUNDNESS);
    if (dist < closestDist) {
      closestDist = dist;
      outColor = d.vec3f(wallColor(scenePos - rect.center, dist, daylight));
    }
  }
  return SceneHit({ dist: closestDist, color: outColor });
};

const applyGhost = (baseColor: d.v3f, ghost: d.Infer<typeof SdCircle>, scenePos: d.v2f) => {
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

const applyNextPreview = (
  color: d.v3f,
  uv: d.v2f,
  gameUv: d.v2f,
  canvasAspect: number,
  nextLevel: number,
  daylight: number,
  time: number,
) => {
  'use gpu';
  const pvHalf = 0.085;
  const pvCorner = 0.02;
  const pvBorder = 0.013;
  const pvFruitR = pvHalf * 0.82;
  const pad = 0.02;
  const pvLocal = d.vec2f((uv.x - 1) * canvasAspect + pvHalf + pad, uv.y - pvHalf - pad);
  const outerDist = sdf.sdRoundedBox2d(pvLocal, d.vec2f(pvHalf), pvCorner);
  const innerDist = sdf.sdRoundedBox2d(pvLocal, d.vec2f(pvHalf - pvBorder), pvCorner * 0.5);
  const outerMask = std.smoothstep(std.fwidth(uv.x), 0, outerDist);
  const interiorMask = std.smoothstep(std.fwidth(uv.x), 0, innerDist);

  let out = std.mix(color, wallColor(pvLocal, outerDist, daylight), outerMask * (1 - interiorMask));
  out = std.mix(out, skyColor(gameUv, daylight, time) * 0.65, interiorMask);

  const pvSpriteUv = (pvLocal / pvFruitR) * 0.5 + 0.5;
  const pvSprite = sampleSprite(pvSpriteUv, nextLevel);
  const fruitAlpha = pvSprite.w * interiorMask;
  return std.mix(out, pvSprite.xyz, fruitAlpha);
};

const applyLoseLine = (baseColor: d.v3f, scenePos: d.v2f) => {
  'use gpu';
  const lineDist = std.abs(scenePos.y - LOSE_LINE_Y) - LOSE_LINE_HALF_THICKNESS;
  const lineAa = std.max(std.fwidth(scenePos.y) * 0.35, 0.0009);
  const lineMask = 1 - std.smoothstep(0.0, lineAa, lineDist);
  const xMask = std.smoothstep(
    PLAYFIELD_HALF_WIDTH - 0.02,
    PLAYFIELD_HALF_WIDTH - 0.05,
    std.abs(scenePos.x),
  );
  const dashCell = std.abs(std.fract(scenePos.x * 12) - 0.5);
  const dash = 1 - std.smoothstep(0.18, 0.22, dashCell);
  return std.mix(baseColor, d.vec3f(1, 0.97, 0.92), lineMask * xMask * dash * 0.9);
};

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
    let dangerAccum = d.arrayOf(d.f32, LEVEL_COUNT)(LEVEL_F32_ZEROS);

    for (let i = d.u32(0); i < frame.activeCount; i++) {
      const circle = circleUniform.$[i];
      const k = SMOOTH_MIN_K * (1 + (1 - circle.speed) * SHARP_FACTOR);
      // exp(-k * dist) < 1e-3 beyond this threshold
      if ((std.length(scenePos - circle.center) - circle.radius) * k > 7) {
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
      dangerAccum[lv] += circle.danger * weight;
    }

    let bestDanger = d.f32(0);
    for (let level = d.i32(0); level < LEVEL_COUNT; level++) {
      const safeSmooth = std.max(smoothAccum[level], 1e-6);
      const dist = -std.log(safeSmooth) / SMOOTH_MIN_K;
      const blendedUv = uvAccum[level] / std.max(uvWeight[level], 1e-6);
      if (uvWeight[level] > 0 && dist < bestDist) {
        bestDist = dist;
        bestLevel = d.f32(level);
        bestUv = d.vec2f(blendedUv);
        bestDanger = dangerAccum[level] / std.max(uvWeight[level], 1e-6);
      }
    }

    return {
      distance: d.vec4f(bestDist, 0, 0, 0),
      info: d.vec4f(bestUv, bestLevel, bestDanger),
    };
  },
  targets: {
    distance: { format: 'r16float' },
    info: { format: 'rgba16float' },
  },
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

    const bestDist = std.textureSampleLevel(mergedFieldLayout.$.distance, linSampler.$, uv, 0).x;
    const info = std.textureSampleLevel(mergedFieldLayout.$.info, nearSampler.$, uv, 0);
    // Fruit glow on bucket interior back wall
    bg +=
      blendSprite(d.vec2f(0.5), d.i32(info.z)) *
      std.exp(-std.max(bestDist, 0) * 12) *
      bucketMask *
      0.4;

    const hit = evalWalls(scenePos, evalFruits(bestDist, info, frame.activeCount), daylight);
    const alpha = std.smoothstep(std.fwidth(scenePos.x), 0, hit.dist);
    let sceneColor = std.mix(bg, hit.color, alpha);
    let finalColor = applyGhost(sceneColor, frame.ghostCircle, scenePos);
    finalColor = applyNextPreview(
      finalColor,
      uv,
      gameUv,
      frame.canvasAspect,
      frame.nextLevel,
      daylight,
      frame.time,
    );
    finalColor = applyLoseLine(finalColor, scenePos);

    return d.vec4f(finalColor, 1);
  },
});

const resizeObserver = new ResizeObserver(() => {
  mergedField.distance.destroy();
  mergedField.info.destroy();
  mergedField = createMergedFieldResources();
  distanceView = mergedField.distance.createView(d.texture2d());
  infoView = mergedField.info.createView(d.texture2d());
  mergedFieldBindGroup = root.createBindGroup(mergedFieldLayout, {
    distance: distanceView,
    info: infoView,
  });
});
resizeObserver.observe(canvas);

canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false, signal });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, signal });
canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false, signal });

function pointerToSceneX(clientX: number, rect: DOMRect): number {
  const uvX = (clientX - rect.left) / rect.width;
  const aspect = canvas.width / canvas.height;
  const scaleX = aspect > GAME_ASPECT ? GAME_ASPECT / aspect : 1;
  const offsetX = (1 - scaleX) / 2;
  return (((uvX - offsetX) / scaleX) * 2 - 1) * SCENE_SCALE;
}

canvas.addEventListener(
  'pointermove',
  (e) => {
    if (isGameOver) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sceneX = pointerToSceneX(e.clientX, rect);
    ghostX = clampSpawnX(sceneX, LEVEL_RADII[ghostLevel]);
  },
  { signal },
);

function trySpawn() {
  const now = performance.now() * 0.001;
  if (isGameOver || now - lastSpawnTime < SPAWN_COOLDOWN || activeFruits.length >= MAX_FRUITS) {
    return;
  }
  spawnFruit(ghostLevel, ghostX);
  lastSpawnTime = now;
  ghostLevel = nextGhostLevel;
  nextGhostLevel = randomLevel();
  ghostX = clampSpawnX(ghostX, LEVEL_RADII[ghostLevel]);
}

canvas.addEventListener(
  'touchend',
  (e) => {
    e.preventDefault();
    if (isGameOver) {
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ghostX = clampSpawnX(pointerToSceneX(touch.clientX, rect), LEVEL_RADII[ghostLevel]);
    trySpawn();
  },
  { signal },
);

canvas.addEventListener('click', trySpawn, { signal });

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
  const bodyIndex = physics.addBall(x, y, radius, contours[level], level, vx, vy, angle);
  activeFruits.push({
    level,
    radius,
    bodyIndex,
    dead: false,
    spawnTime: performance.now(),
    isMerge,
    dangerStartTime: null,
  });
}

function restart() {
  for (const fruit of activeFruits) {
    if (!fruit.dead) {
      physics.removeBall(fruit.bodyIndex);
    }
  }
  activeFruits = [];
  ghostLevel = randomLevel();
  nextGhostLevel = randomLevel();
  ghostX = 0;
  lastSpawnTime = -Infinity;
  isGameOver = false;
  score = 0;
  scoreEl.textContent = '0';
  finalScoreEl.textContent = '0';
  loseScreenEl.hidden = true;
  for (let i = 0; i < MAX_FRUITS; i++) {
    circleData[i] = { ...INACTIVE_CIRCLE };
  }
  circleUniform.write(circleData);
}

let lastTime = 0;
let animationFrameId = 0;

function frame(now: number) {
  if (signal.aborted) {
    return;
  }
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const merges = physics.step(
    dt,
    MERGE_DISTANCE_FACTOR,
    PULL_ACTIVATION_FACTOR,
    PULL_FORCE,
    LEVEL_COUNT - 1,
  );

  if (!isGameOver) {
    for (const m of merges) {
      for (const f of activeFruits) {
        if (f.bodyIndex === m.handleA || f.bodyIndex === m.handleB) {
          f.dead = true;
        }
      }
      score += MERGE_SCORES[m.level];
      scoreEl.textContent = String(score);
      spawnFruit(m.level + 1, m.pos.x, m.pos.y, m.vel.x, m.vel.y, m.angle, true);
    }
  }

  let drawCount = 0;

  for (let i = 0; i < activeFruits.length; i++) {
    const f = activeFruits[i];
    if (f.dead) {
      continue;
    }
    const state = physics.getBallState(f.bodyIndex);
    if (!state) {
      f.dead = true;
      continue;
    }

    if (!isGameOver) {
      if (isFruitEscaped(state)) {
        triggerGameOver();
      }

      if (state.pos.y > LOSE_LINE_Y) {
        f.dangerStartTime ??= now;
        if (now - f.dangerStartTime >= LOSE_TIMEOUT_MS) {
          triggerGameOver();
        }
      } else {
        f.dangerStartTime = null;
      }
    }

    if (drawCount >= MAX_FRUITS) {
      continue;
    }

    let speed = Math.min(Math.sqrt(state.vel.x ** 2 + state.vel.y ** 2) / SPEED_BLEND_MAX, 1);
    let visualRadius = f.radius;
    const danger = computeDangerStrength(now, f.dangerStartTime);

    if (f.isMerge) {
      const t = Math.min((now - f.spawnTime) / 500, 1);
      const p = 0.4;
      const ease = Math.pow(2, -9 * t) * Math.sin(((t - p / 4) * 2 * Math.PI) / p) + 1;
      visualRadius = f.radius * ease;
      speed = Math.max(speed, 1 - t * t);
    }

    if (visualRadius <= MIN_RADIUS) {
      continue;
    }

    circleData[drawCount] = {
      center: d.vec2f(state.pos.x, state.pos.y),
      radius: visualRadius,
      level: f.level,
      angle: state.angle,
      speed,
      danger,
    };
    drawCount++;
  }

  activeFruits = activeFruits.filter((f) => !f.dead);

  if (!isGameOver) {
    bgTime = (bgTime + dt * timeScale + 1000) % 1000;
  }

  circleUniform.write(circleData);
  frameUniform.write({
    time: bgTime,
    canvasAspect: canvas.width / canvas.height,
    activeCount: drawCount,
    nextLevel: nextGhostLevel,
    ghostCircle: isGameOver
      ? INACTIVE_CIRCLE
      : {
          center: d.vec2f(ghostX, DROP_Y),
          radius: LEVEL_RADII[ghostLevel],
          level: ghostLevel,
          angle: 0,
          speed: 0,
          danger: 0,
        },
  });

  mergedFieldPipeline
    .withColorAttachment({
      distance: { view: distanceView },
      info: { view: infoView },
    })
    .draw(3);

  renderPipeline
    .with(mergedFieldBindGroup)
    .withColorAttachment({ view: context, clearValue: { r: 0, g: 0, b: 0, a: 1 } })
    .draw(3);

  animationFrameId = requestAnimationFrame(frame);
}
animationFrameId = requestAnimationFrame(frame);

export const controls = defineControls({
  Restart: {
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

export function onCleanup() {
  cleanupController.abort();
  cancelAnimationFrame(animationFrameId);
  resizeObserver.disconnect();
  root.destroy();
}

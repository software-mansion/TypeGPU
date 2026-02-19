import { d } from 'typegpu';

// deno-fmt-ignore: better readability
export const LEVEL_RADII = [0.12, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48]
  .map((x) => x * 1.3);
export const LEVEL_COUNT = LEVEL_RADII.length;
export const MAX_LEVEL_RADIUS = LEVEL_RADII[LEVEL_COUNT - 1];

export const WALL_DEFS = [
  { cx: 0, cy: -0.5, hw: 0.5, hh: 0.05 },
  { cx: 0.5, cy: 0, hw: 0.05, hh: 0.55 },
  { cx: -0.5, cy: 0, hw: 0.05, hh: 0.55 },
];

// Rendering
export const WALL_COLOR = d.vec3f(0.55, 0.5, 0.45);
export const WALL_ROUNDNESS = 0.035;
export const EDGE_WIDTH = 0.003;
export const MIN_RADIUS = 0.001;
export const GHOST_ALPHA = 0.45;
export const SMOOTH_MIN_K = 32.0;
export const COLOR_BLEND_K = 8.0;

// Game logic
export const MAX_FRUITS = 128;
export const OFFSCREEN = 10;
export const DROP_Y = 0.65;
export const SPAWN_WEIGHTS = [4, 3, 2, 1];
export const SPAWN_WEIGHT_TOTAL = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
export const MERGE_DISTANCE_FACTOR = 0.4;
export const PLAYFIELD_HALF_WIDTH = 0.65;
export const SPAWN_COOLDOWN = 0.35;

import { d, std } from 'typegpu';
import type { SpringProperties } from './spring.ts';

// Rendering constants
export const MAX_STEPS = 64;
export const MAX_DIST = 10;
export const SURF_DIST = 0.001;

// Ground material constants
// Linear blue-gray, tuned for the example page's dark #1b1f2c background.
export const GROUND_ALBEDO = d.vec3f(0.025, 0.032, 0.054);
export const LIGHT_GROUND_ALBEDO = d.vec3f(0.65, 0.7, 0.79);
export const EXPOSURE = 1.5;
export const METER_TICKS = 16;

export const GroundParams = {
  groundThickness: 0.01,
  groundRoundness: 0.01,
  jellyCutoutRadius: 0.38,
  meterCutoutRadius: 0.6,
  meterCutoutGirth: 0.04,
};

// Lighting constants
export const AMBIENT_COLOR = d.vec3f(0.6);
export const AMBIENT_INTENSITY = 0.6;
export const SPECULAR_POWER = 10;
export const SPECULAR_INTENSITY = 0.6;
export const LIGHT_DIR = std.normalize(d.vec3f(-0.5, -0.14, -0.8));
// Light travels from above and behind the knob toward the camera (+Z).
export const LIGHT_MODE_LIGHT_DIR = std.normalize(d.vec3f(-0.12, -0.75, 0.7));

// Jelly material constants
export const JELLY_IOR = 1.42;
export const JELLY_SCATTER_STRENGTH = 3;

// Ambient occlusion constants
export const AO_STEPS = 3;
export const AO_RADIUS = 0.1;
export const AO_INTENSITY = 0.5;
export const AO_BIAS = SURF_DIST * 5;

// Jelly constants
export const JELLY_HALFSIZE = d.vec3f(0.3, 0.3, 0.3);

// Spring dynamics constants
export const twistProperties: SpringProperties = {
  mass: 4,
  stiffness: 700,
  damping: 50,
};

export const wiggleXProperties: SpringProperties = {
  mass: 1,
  stiffness: 1000,
  damping: 20,
};

export const wiggleZProperties: SpringProperties = {
  mass: 1,
  stiffness: 1000,
  damping: 20,
};

// Mouse interaction constants
export const MOUSE_SMOOTHING = 0.08;
export const MOUSE_MIN_X = 0.45;
export const MOUSE_MAX_X = 0.9;
export const MOUSE_RANGE_MIN = 0.4;
export const MOUSE_RANGE_MAX = 0.9;
export const TARGET_MIN = -0.7;
export const TARGET_MAX = 1.0;
export const TARGET_OFFSET = -0.5;

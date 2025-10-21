import * as d from 'typegpu/data';

// Rendering constants
export const MAX_STEPS = 64;
export const MAX_DIST = 10;
export const SURF_DIST = 0.001;

// Lighting constants
export const AMBIENT_COLOR = d.vec3f(1);
export const AMBIENT_INTENSITY = 0.2;
export const SPECULAR_POWER = 32.0;
export const SPECULAR_INTENSITY = 0.4;

// Jelly material constants
export const JELLY_IOR = 1.42;
export const JELLY_ABSORB = d.vec3f(1.6, 3.2, 6.0).mul(5);
export const JELLY_SCATTER_TINT = d.vec3f(1.0, 0.3, 0.05).mul(1.5);
export const JELLY_SCATTER_STRENGTH = 1.3;

// Ambient occlusion constants
export const AO_STEPS = 3;
export const AO_RADIUS = 0.2;
export const AO_INTENSITY = 0.8;
export const AO_BIAS = SURF_DIST * 5;

// Line/slider constants
export const LINE_RADIUS = 0.024;
export const LINE_HALF_THICK = 0.17;

// Mouse interaction constants
export const MOUSE_SMOOTHING = 0.08;
export const MOUSE_MIN_X = 0.45;
export const MOUSE_MAX_X = 0.9;
export const MOUSE_RANGE_MIN = 0.4;
export const MOUSE_RANGE_MAX = 0.9;
export const TARGET_MIN = -0.7;
export const TARGET_MAX = 1.0;
export const TARGET_OFFSET = -0.5;

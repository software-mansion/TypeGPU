import { d } from 'typegpu';
import type { SpringProperties } from './spring.ts';

// Rendering constants
export const MAX_STEPS = 64;
export const MAX_DIST = 10;
export const SURF_DIST = 0.001;

// Ground material constants
export const LIGHT_GROUND_ALBEDO = d.vec3f(1);
export const DARK_GROUND_ALBEDO = d.vec3f(0.2);

// Lighting constants
export const AMBIENT_COLOR = d.vec3f(0.6);
export const AMBIENT_INTENSITY = 0.6;
export const SPECULAR_POWER = 10;
export const SPECULAR_INTENSITY = 0.6;

// Jelly material constants
export const JELLY_IOR = 1.42;
export const JELLY_SCATTER_STRENGTH = 3;

// Ambient occlusion constants
export const AO_STEPS = 3;
export const AO_RADIUS = 0.1;
export const AO_INTENSITY = 0.5;
export const AO_BIAS = SURF_DIST * 5;

// Jelly constants
export const JELLY_HALFSIZE = d.vec3f(0.35, 0.3, 0.3);
export const SWITCH_RAIL_LENGTH = 0.4;
export const SWITCH_ACCELERATION = 100;

// Spring dynamics constants
export const squashXProperties: SpringProperties = {
  mass: 1,
  stiffness: 1000,
  damping: 10,
};
export const squashZProperties: SpringProperties = {
  mass: 1,
  stiffness: 900,
  damping: 12,
};
export const wiggleXProperties: SpringProperties = {
  mass: 1,
  stiffness: 1000,
  damping: 20,
};

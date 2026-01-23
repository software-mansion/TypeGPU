import { d } from 'typegpu';

export const FOV_FACTOR = 1;

export const SUN_DIRECTION = d.vec3f(1.0, 0.0, 0.0);
export const SUN_BRIGHTNESS = 0.9;
export const LIGHT_ABSORPTION = 0.88;

export const CLOUD_COVERAGE = 0.7;
export const CLOUD_AMPLITUDE = 1.0;
export const CLOUD_FREQUENCY = 1.4;
export const WIND_SPEED = 1.0;

export const FBM_OCTAVES = 3;
export const FBM_PERSISTENCE = 0.5;
export const FBM_LACUNARITY = 2.0;

export const CLOUD_BRIGHT = d.vec3f(1.0, 1.0, 1.0);
export const CLOUD_DARK = d.vec3f(0.2, 0.2, 0.2);
export const SKY_AMBIENT = d.vec3f(0.6, 0.45, 0.75);
export const SUN_COLOR = d.vec3f(1.0, 0.7, 0.3);
export const SKY_HORIZON = d.vec3f(0.75, 0.66, 0.9);
export const SKY_ZENITH_TINT = d.vec3f(1.0, 0.7, 0.43);
export const SUN_GLOW = d.vec3f(1.0, 0.37, 0.17);

export const NOISE_Z_OFFSET = d.vec2f(37.0, 239.0);
export const NOISE_TEXTURE_SIZE = 256;

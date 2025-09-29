import * as d from 'typegpu/data';

import type { CameraConfig, GridConfig } from './types.ts';

export const EPS = 1e-6;
export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  zoomable: true,
  draggable: true,
  position: d.vec4f(14, 8, 14, 1),
  target: d.vec3f(),
  up: d.vec3f(0, 1, 0),
  fov: Math.PI / 4,
  near: 0.1,
  far: 1000,
  orbitSensitivity: 0.005,
  zoomSensitivity: 0.05,
  maxZoom: 7,
};
export const DEFAULT_TRANSLATION = d.vec3f(0, -2, 0);
export const DEFAULT_SCALE = d.vec3f(5, 1, 5);
export const DEFAULT_PLANE_TRANSLATION = d.vec3f(0, -2.1, 0);
export const DEFAULT_PLANE_SCALE = d.vec3f(5.1);
export const DEFAULT_PLANE_COLOR = d.vec4f(d.vec3f(0.29, 0.21, 0.47), 0.5);
export const PLANE_GRID_CONFIG: GridConfig = {
  nx: 2,
  nz: 2,
  xRange: { min: -1, max: 1 },
  zRange: { min: -1, max: 1 },
  yCallback: () => 0,
  colorCallback: () => DEFAULT_PLANE_COLOR,
};

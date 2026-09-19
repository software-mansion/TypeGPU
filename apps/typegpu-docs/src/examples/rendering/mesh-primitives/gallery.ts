import { d, std } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { place } from './geometry.ts';

const floor = meshes.plane({ width: 6, depth: 6 });
const twoSidedFloor = meshes.concat(floor, meshes.transform(floor, std.rotationX4(Math.PI)));

export const gallery = meshes.concat(
  place(twoSidedFloor, d.vec3f(0, -0.51, 0), d.vec3f(0.75, 0.75, 0.8)),
  place(meshes.box(), d.vec3f(-1.5, 0, 1), d.vec3f(0.9, 0.35, 0.3)),
  place(meshes.cylinder(), d.vec3f(1.5, 0, 1), d.vec3f(0.3, 0.6, 0.9)),
  place(meshes.torus(), d.vec3f(1.5, -0.35, -1), d.vec3f(0.95, 0.75, 0.2)),
  place(meshes.sphere(), d.vec3f(-1.5, 0, -1), d.vec3f(0.4, 0.85, 0.5)),
);

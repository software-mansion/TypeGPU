import { meshes } from '@typegpu/geometry';
import { d, std, tgpu } from 'typegpu';
import { Camera } from '../../common/setup-first-person-camera.ts';

export const cameraAccess = tgpu.accessor(Camera);

export const scene = meshes.unindexed(
  meshes.concat(
    meshes.transform(meshes.plane({ width: 10, depth: 10 }), std.translation4(d.vec3f(0, -10, 0))),
    meshes.transform(meshes.torus({ radius: 2, tube: 0.5 }), std.translation4(d.vec3f(0, 5, 0))),
  ),
);

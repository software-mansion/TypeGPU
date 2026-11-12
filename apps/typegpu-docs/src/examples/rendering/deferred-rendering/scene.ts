import { meshes } from '@typegpu/geometry';
import { d, std, tgpu } from 'typegpu';
import { Camera } from '../../common/setup-first-person-camera.ts';

export const cameraAccess = tgpu.accessor(Camera);

const Color = d.struct({ color: d.vec3f });
class EnhancedGeometry<T extends meshes.Placed> {
  geometry: meshes.IndexedGeometry<T>;

  constructor(geometry: meshes.IndexedGeometry<T>) {
    this.geometry = geometry;
  }

  move(offset: [number, number, number]) {
    return new EnhancedGeometry(
      meshes.transform(this.geometry, std.translation4(d.vec3f(...offset))),
    );
  }

  color(color: [number, number, number]) {
    const colorVec = d.vec3f(...color);
    return new EnhancedGeometry(
      meshes.attach(this.geometry, Color, () => {
        'use gpu';
        return Color({ color: colorVec });
      }),
    );
  }
}

const plane = new EnhancedGeometry(meshes.plane({ width: 40, depth: 40 }))
  .move([0, 0, 0])
  .color([0.3, 0.3, 0.3]);

const torus = new EnhancedGeometry(meshes.torus({ radius: 2, tube: 0.5 }))
  .move([10, 3, 10])
  .color([1, 0.2, 0.2]);

export const scene = meshes.unindexed(meshes.concat(plane.geometry, torus.geometry));

import { meshes } from '@typegpu/geometry';
import { d, std } from 'typegpu';
import { timeAccess } from './slots.ts';

const Color = d.struct({ color: d.vec3f });
class EnhancedGeometry<T extends meshes.Placed> {
  geometry: meshes.IndexedGeometry<T>;

  constructor(geometry: meshes.IndexedGeometry<T>) {
    this.geometry = geometry;
  }

  move(offset: [number, number, number]) {
    const newGeometry = meshes.transform(this.geometry, std.translation4(d.vec3f(...offset)));
    return new EnhancedGeometry(newGeometry);
  }

  color(color: [number, number, number]) {
    const colorVec = d.vec3f(...color);
    const newGeometry = meshes.attach(this.geometry, Color, () => {
      'use gpu';
      return Color({ color: colorVec });
    });

    return new EnhancedGeometry(newGeometry);
  }

  revolve() {
    const newGeometry = meshes.map(this.geometry, this.geometry.schema, (vertex) => {
      'use gpu';
      const vertexCopy = std.copy(vertex);
      const time = timeAccess.$ / 1000;
      const transformation = std.rotationY4(time);
      vertexCopy.position = (d.vec4f(vertexCopy.position, 1) * transformation).xyz;
      vertexCopy.normal = (d.vec4f(vertexCopy.normal, 0) * transformation).xyz;
      return vertexCopy;
    });
    return new EnhancedGeometry(newGeometry);
  }

  bob() {
    const newGeometry = meshes.map(this.geometry, this.geometry.schema, (vertex) => {
      'use gpu';
      const vertexCopy = std.copy(vertex);
      const time = timeAccess.$ / 1000;
      vertexCopy.position.y += std.sin(time);
      return vertexCopy;
    });
    return new EnhancedGeometry(newGeometry);
  }
}

const plane = new EnhancedGeometry(meshes.plane({ width: 40, depth: 40 }))
  .move([0, 0, 0])
  .color([0.3, 0.3, 0.3]);

const torus = new EnhancedGeometry(meshes.torus({ radius: 2, tube: 0.5 }))
  .move([10, 3, 10])
  .color([1, 0.2, 0.2]);

const revolvingCube = new EnhancedGeometry(meshes.box({ width: 3, depth: 4, height: 5 }))
  .revolve()
  .move([-10, 3, 10])
  .color([0.2, 0.5, 0.9]);

const bobbingCone = new EnhancedGeometry(
  (() => {
    const radius = 3;
    const height = 8;
    const cylinder = meshes.cylinder({ radius, height, radialSegments: 100 });
    return meshes.map(cylinder, cylinder.schema, (vertex) => {
      'use gpu';
      const vertexCopy = std.copy(vertex);

      const p = vertexCopy.position;
      const factor = (0.5 * height - p.y) / height; // 1 at the bottom, 0 at the top
      vertexCopy.position = d.vec3f(p.x * factor, p.y, p.z * factor);

      if (vertex.normal.y === 0) {
        // Side normals need adjusting.
        const newNormal = vertexCopy.normal;
        newNormal.y += radius / height;
        vertexCopy.normal = std.normalize(newNormal);
      }

      return vertexCopy;
    });
  })(),
)
  .bob()
  .move([-10, 6, -10])
  .color([0.3, 0.7, 0.3]);

// All meshes must be colored for this to work!
export const scene = meshes.unindexed(
  meshes.concat(plane.geometry, torus.geometry, revolvingCube.geometry, bobbingCone.geometry),
);

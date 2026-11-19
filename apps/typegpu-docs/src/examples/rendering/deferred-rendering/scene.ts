import { meshes } from '@typegpu/geometry';
import { d, std, type TgpuRoot } from 'typegpu';
import { timeAccess } from './slots.ts';
import { perlin3d } from '@typegpu/noise';

const Material = d.struct({ material: d.vec4f });
class EnhancedGeometry<T extends meshes.Placed = meshes.Placed> {
  #geometry;
  #color;
  #specular;

  constructor(
    geometry: meshes.IndexedGeometry<T>,
    color: [number, number, number],
    specular: number,
  ) {
    this.#geometry = geometry;
    this.#color = color;
    this.#specular = specular;
  }

  move(offset: [number, number, number]) {
    const newGeometry = meshes.transform(this.#geometry, std.translation4(d.vec3f(...offset)));
    return new EnhancedGeometry(newGeometry, this.#color, this.#specular);
  }

  revolve() {
    const newGeometry = meshes.map(this.#geometry, this.#geometry.schema, (vertex) => {
      'use gpu';
      const vertexCopy = std.copy(vertex);
      const time = timeAccess.$ / 1000;
      const transformation = std.rotationY4(time);
      vertexCopy.position = (d.vec4f(vertexCopy.position, 1) * transformation).xyz;
      vertexCopy.normal = (d.vec4f(vertexCopy.normal, 0) * transformation).xyz;
      return vertexCopy;
    });
    return new EnhancedGeometry(newGeometry, this.#color, this.#specular);
  }

  bob() {
    const newGeometry = meshes.map(this.#geometry, this.#geometry.schema, (vertex) => {
      'use gpu';
      const vertexCopy = std.copy(vertex);
      const time = timeAccess.$ / 1000;
      vertexCopy.position.y += std.sin(time);
      return vertexCopy;
    });
    return new EnhancedGeometry(newGeometry, this.#color, this.#specular);
  }

  finish() {
    const materialVec = d.vec4f(...this.#color, this.#specular);
    return meshes.attach(this.#geometry, Material, () => {
      'use gpu';
      return Material({ material: materialVec });
    });
  }
}

export function createScene(root: TgpuRoot) {
  const plane = new EnhancedGeometry(meshes.plane({ width: 40, depth: 40 }), [0.3, 0.3, 0.3], 0);

  const torus = new EnhancedGeometry(
    meshes.torus({ radius: 3, tube: 0.5 }),
    [1, 0.2, 0.2],
    0.5,
  ).move([7, 3, 7]);

  const revolvingCube = new EnhancedGeometry(
    meshes.box({ width: 3, depth: 4, height: 5 }),
    [0.2, 0.5, 0.9],
    0.2,
  )
    .revolve()
    .move([-7, 3, 7]);

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
    [0.3, 0.7, 0.3],
    0.2,
  )
    .bob()
    .move([-7, 6, -7]);

  const porousBall = new EnhancedGeometry(
    meshes.parametric(
      {
        at: (u, v) => {
          'use gpu';
          const p = meshes.surfaces.sphere(u, v) * 3;
          return p * (1 + perlin3d.sample(p) / 10);
        },
      },
      { rows: 100, cols: 100 },
    ),
    [0.5, 0.5, 0.5],
    0.5,
  )
    .bob()
    .revolve()
    .move([7, 5, -7]);

  const shapes = [
    plane,
    torus,
    revolvingCube,
    bobbingCone,
    porousBall,
  ] satisfies EnhancedGeometry[];

  return meshes.unindexed(meshes.concat(...shapes.map((shape) => shape.finish())));
}

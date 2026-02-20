import { d } from 'typegpu';
import { Vertex } from './schemas.ts';

export function createCubeGeometry(): d.Infer<typeof Vertex>[] {
  const faces: [number[], number[]][] = [
    [[0, 0, 1], [0, 0, 1]],
    [[0, 0, -1], [0, 0, -1]],
    [[0, 1, 0], [0, 1, 0]],
    [[0, -1, 0], [0, -1, 0]],
    [[1, 0, 0], [1, 0, 0]],
    [[-1, 0, 0], [-1, 0, 0]],
  ];

  const verts: d.Infer<typeof Vertex>[] = [];

  for (const [_offset, normal] of faces) {
    const n = d.vec3f(normal[0], normal[1], normal[2]);
    const absN = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];

    let tangent: number[];
    let bitangent: number[];
    if (absN[2] === 1) {
      tangent = [1, 0, 0];
      bitangent = [0, 1, 0];
    } else if (absN[1] === 1) {
      tangent = [1, 0, 0];
      bitangent = [0, 0, 1];
    } else {
      tangent = [0, 0, 1];
      bitangent = [0, 1, 0];
    }

    const center = normal.map((v) => v * 0.5);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ];

    for (const [u, v] of corners) {
      verts.push({
        position: d.vec3f(
          center[0] + (tangent[0] * u + bitangent[0] * v) * 0.5,
          center[1] + (tangent[1] * u + bitangent[1] * v) * 0.5,
          center[2] + (tangent[2] * u + bitangent[2] * v) * 0.5,
        ),
        normal: n,
      });
    }
  }

  return verts;
}

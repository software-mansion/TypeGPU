import tgpu from 'typegpu';
import { f32, struct, u32, vec2f } from 'typegpu/data';
import { cos, select, sin } from 'typegpu/std';

const PI = tgpu['~unstable'].const(f32, Math.PI);

const SubdivLevelResult = struct({
  level: u32,
  pointCount: u32,
  vertexCountInLevel: u32,
  vertexIndexInLevel: u32,
});

const getSubdivLevel = tgpu['~unstable'].fn([u32], SubdivLevelResult)(
  (vertexIndex) => {
    let totalVertexCount = u32(0);
    for (let level = u32(0); level < 8; level += 1) {
      const pointCount = u32(3) * (u32(1) << level);
      const triangleCount = select(
        u32(1),
        u32(3 * (1 << (level - 1))),
        level > 0,
      );
      const vertexCountInLevel = 3 * triangleCount;
      const newVertexCount = totalVertexCount + vertexCountInLevel;

      if (vertexIndex < newVertexCount) {
        return SubdivLevelResult({
          level,
          pointCount,
          vertexCountInLevel,
          vertexIndexInLevel: vertexIndex - totalVertexCount,
        });
      }
      totalVertexCount = newVertexCount;
    }
    return SubdivLevelResult({
      level: 0,
      pointCount: 0,
      vertexCountInLevel: 0,
      vertexIndexInLevel: 0,
    });
  },
);

const consecutiveTriangleVertexIndex = tgpu['~unstable'].fn([u32], u32)(
  (i) => {
    return (2 * (i + 1)) / 3;
  },
);

/**
 * Given a `vertexIndex`, returns the unit vector which can be
 * added to the circle center and scaled using radius.
 * Render using triangle list.
 * To decide on how many vertices to render, use `circleMaxAreaVertexCount(subdivLevel)`.
 *
 * This method of triangulating a circle should generally be
 * more performant than `circleFan` due to less overdraw.
 * For more information, see https://www.humus.name/index.php?page=News&ID=228
 */
export const circleMaxArea = tgpu['~unstable'].fn([u32], vec2f)(
  (vertexIndex) => {
    const subdiv = getSubdivLevel(vertexIndex);
    const i = consecutiveTriangleVertexIndex(subdiv.vertexIndexInLevel);
    const pointCount = subdiv.pointCount;
    const angle = 2 * PI.$ * f32(i) / f32(pointCount);
    return vec2f(cos(angle), sin(angle));
  },
);

export function circleMaxAreaVertexCount(subdivLevel: number) {
  let totalVertexCount = 3;
  for (let level = 0; level < subdivLevel; level += 1) {
    totalVertexCount += 9 * (1 << level);
  }
  return totalVertexCount;
}

/**
 * Given a `vertexIndex`, returns the unit vector which can be
 * added to the circle center and scaled using radius.
 * Render using triangle list.
 * Once you decide on `triangleCount`,
 * number of vertices to render is `triangleCount * 3`.
 */
export const circleFan = tgpu['~unstable'].fn([u32, u32], vec2f)(
  (vertexIndex, triangleCount) => {
    const triangleIndex = vertexIndex / 3;
    const vertexInTriangle = vertexIndex % 3;
    if (vertexInTriangle === 2) {
      return vec2f(0, 0);
    }
    const i = triangleIndex + vertexInTriangle;
    const angle = 2 * PI.$ * f32(i) / f32(triangleCount);
    return vec2f(cos(angle), sin(angle));
  },
);

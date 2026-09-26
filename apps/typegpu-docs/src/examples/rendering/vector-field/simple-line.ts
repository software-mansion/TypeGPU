import { LineControlPoint, lineSegmentIndices, lineSegmentVariableWidth } from '@typegpu/geometry';
import tgpu, { d, type TgpuRoot } from 'typegpu';

export function createLine(root: TgpuRoot, () => { }) {
  const MAX_JOIN_COUNT = 1;
  const indices = lineSegmentIndices(MAX_JOIN_COUNT);

  const maxIndex = Math.max(...indices);
  const indexBuffer = root.createBuffer(d.arrayOf(d.u16, indices.length), indices).$usage('index');

  const vertex = tgpu.vertexFn({
    in: {
      instanceIndex: d.builtin.instanceIndex,
      vertexIndex: d.builtin.vertexIndex,
    },
    out: {
      outPos: d.builtin.position,
    },
  })(({ vertexIndex, instanceIndex: arrowIdx }) => {
    'use gpu';
    const arrowX = arrowIdx % GRID_SIZE;
    const arrowY = d.u32(arrowIdx / GRID_SIZE);
    // An arrow pointing to the top-right corner
    const startPos = d.vec2f(arrowX, arrowY) / GRID_SIZE;
    const endPos = (d.vec2f(arrowX, arrowY) + 1) / GRID_SIZE;

    const A = LineControlPoint({
      position: startPos,
      radius: 0.02,
    });
    const B = LineControlPoint({
      position: std.mix(startPos, endPos, 0.25),
      radius: 0.02,
    });
    const C = LineControlPoint({
      position: std.mix(startPos, endPos, 0.75),
      radius: 0.02,
    });
    const D = LineControlPoint({
      position: endPos,
      radius: 0.02,
    });

    const result = lineSegmentVariableWidth(vertexIndex, A, B, D, D, MAX_JOIN_COUNT);

    return {
      outPos: d.vec4f(result.vertexPosition, 0, 1),
    };
  });

  return {
    vertex,
  };
}

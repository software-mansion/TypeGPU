import { expect } from 'vitest';
import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import {
  joins,
  joinSlot,
  LineControlPoint,
  miterJoinLimitSlot,
  polylineVariableWidth,
} from '@typegpu/geometry';

it('configures joins through exported slots', () => {
  const vertex = tgpu.fn(
    [LineControlPoint, d.u32],
    d.vec2f,
  )((point, i) => {
    'use gpu';
    return polylineVariableWidth(point, point, point, point, i, 4).vertexPosition;
  });

  const code = tgpu.resolve([vertex.with(joinSlot, joins.miter).with(miterJoinLimitSlot, 3)]);

  expect(code).toContain('miterLimit(miterPointBisectorWhenClockwise(join.start, join.end), 3i)');
});

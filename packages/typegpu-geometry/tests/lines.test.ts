import { expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import {
  JoinInput,
  joins,
  joinSlot,
  LineControlPoint,
  miterJoinLimitSlot,
  polylineVariableWidth,
} from '@typegpu/geometry';

const turn = JoinInput({
  C: LineControlPoint({ position: d.vec2f(1, 2), radius: 0.5 }),
  v: d.vec2f(1, 2),
  d: d.vec2f(1, 0),
  fw: d.vec2f(0, 1),
  cross: d.vec2f(1, 0),
  start: d.vec2f(1, 0),
  end: d.vec2f(0, 1),
});

it('cuts a bevel join straight between the sides of the two segments', () => {
  const points = [0, 1, 2, 3, 4].map((i) => joins.bevel(turn, i, 4));
  const start = d.vec2f(1.5, 2);
  const end = d.vec2f(1, 2.5);

  expect(points[0]).toEqual(turn.v);
  expect(points[4]).toEqual(std.mix(start, end, 0.5));
  for (const point of points.slice(1)) {
    expect(std.dot(point.sub(start), d.vec2f(1, 1))).toBeCloseTo(0);
  }
});

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

import { LineSegmentVertex } from '@typegpu/geometry';
import { perlin2d, randf } from '@typegpu/noise';
import tgpu from 'typegpu';
import { arrayOf, f32, i32, mat2x2f, u32, vec2f } from 'typegpu/data';
import { abs, add, clamp, cos, floor, mul, pow, select, sin } from 'typegpu/std';
import { TEST_SEGMENT_COUNT } from './constants.ts';

const testCaseShell = tgpu.fn([u32, f32], LineSegmentVertex);

const segmentSide = tgpu.const(arrayOf(f32, 4), [-1, -1, 1, 1]);

export const segmentAlternate = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const side = segmentSide.$[vertexIndex];
  const r = sin(time + select(0, Math.PI / 2, side === -1));
  const radius = 0.4 * r * r;
  return LineSegmentVertex({
    position: vec2f(0.5 * side * cos(time), 0.5 * side * sin(time)),
    radius,
  });
});

export const segmentStretch = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const side = segmentSide.$[vertexIndex];
  const distance = 0.5 * clamp(0.55 * sin(1.5 * time) + 0.5, 0, 1);
  return LineSegmentVertex({
    position: vec2f(distance * side * cos(time), distance * side * sin(time)),
    radius: 0.25,
  });
});

export const segmentContainsAnotherEnd = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const side = segmentSide.$[vertexIndex];
  return LineSegmentVertex({
    position: vec2f(side * 0.25 * (1 + clamp(sin(time), -0.8, 1)), 0),
    radius: 0.25 + side * 0.125,
  });
});

export const caseVShapeSmall = testCaseShell((vertexIndex, t) => {
  'use gpu';
  const side = clamp(f32(vertexIndex) - 2, -1, 1);
  const isMiddle = side === 0;
  return LineSegmentVertex({
    position: vec2f(0.5 * side, select(0.5 * cos(t), 0, isMiddle)),
    radius: select(0.1, 0.2, isMiddle),
  });
});

export const caseVShapeBig = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const side = clamp(f32(vertexIndex) - 2, -1, 1);
  const isMiddle = side === 0;
  return LineSegmentVertex({
    position: vec2f(0.5 * side, select(0.5 * cos(time), 0, isMiddle)),
    radius: select(0.3, 0.2, isMiddle),
  });
});

export const halfCircle = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const angle = (Math.PI * clamp(f32(vertexIndex) - 1, 0, 50)) / 50;
  const radius = 0.5 * cos(time);
  return LineSegmentVertex({
    position: vec2f(radius * cos(angle), radius * sin(angle)),
    radius: 0.2,
  });
});

export const halfCircleThin = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const result = halfCircle(vertexIndex, time);
  result.radius = 0.01;
  return result;
});

export const bending = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const i = clamp(f32(vertexIndex) - 1, 0, 48) / 48;
  const x = 2 * i - 1;
  const s = sin(time);
  const n = 10 * s * s * s * s + 0.25;
  const base = clamp(1 - pow(abs(x), n), 0, 1);
  return LineSegmentVertex({
    position: vec2f(0.5 * x, 0.5 * pow(base, 1 / n)),
    radius: 0.2,
  });
});

export const animateWidth = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const i = (f32(vertexIndex) % TEST_SEGMENT_COUNT) / TEST_SEGMENT_COUNT;
  const x = cos(4 * 2 * Math.PI * i + Math.PI / 2);
  const y = cos(5 * 2 * Math.PI * i);
  return LineSegmentVertex({
    position: vec2f(0.8 * x, 0.8 * y),
    radius: 0.05 * clamp(sin(8 * Math.PI * i - 3 * time), 0.1, 1),
  });
});

export const perlinTraces = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const perLine = u32(200);
  const n = floor(f32(vertexIndex) / f32(perLine));
  const x = (2 * f32(clamp(vertexIndex % perLine, 2, perLine - 2))) / f32(perLine) - 1;
  const value =
    0.5 * perlin2d.sample(vec2f(2 * x + 2 * time, time + 0.1 * n)) +
    0.25 * perlin2d.sample(vec2f(4 * x, time + 100 + 0.1 * n)) +
    0.125 * perlin2d.sample(vec2f(8 * x, time + 200 + 0.2 * n)) +
    0.0625 * perlin2d.sample(vec2f(16 * x, time + 300 + 0.3 * n));
  const y = 0.125 * n - 0.5 + 0.5 * value;
  const radiusFactor = 0.025 * (n + 1);
  return LineSegmentVertex({
    position: vec2f(0.8 * x, y),
    radius: select(radiusFactor * radiusFactor, -1, vertexIndex % perLine === 0),
  });
});

export const bars = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const VERTS_PER_LINE = u32(5);
  const lineIndex = f32(u32(vertexIndex / VERTS_PER_LINE));
  const y = f32(clamp(vertexIndex % VERTS_PER_LINE, 1, 2) - 1);
  const x = 20 * ((2 * f32(VERTS_PER_LINE) * lineIndex) / TEST_SEGMENT_COUNT - 1);
  return LineSegmentVertex({
    position: vec2f(0.8 * x, 0.8 * y * sin(x + time)),
    radius: select(clamp(0.08 * abs(sin(x + time)), 0, 0.01), -1, vertexIndex % 5 === 4),
  });
});

export const arms = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const s = sin(time);
  const c = cos(time);
  const r = 0.25;
  const points = [
    vec2f(r * s - 0.25, r * c),
    vec2f(-0.25, 0),
    vec2f(0.25, 0),
    vec2f(-r * s + 0.25, r * c),
  ];
  const i = clamp(i32(vertexIndex) - 1, 0, 3);
  return LineSegmentVertex({
    position: points[i],
    radius: 0.2,
  });
});

export const armsSmall = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const result = arms(vertexIndex, time);
  return LineSegmentVertex({
    position: result.position,
    radius: select(0.1, 0.2, vertexIndex === 2 || vertexIndex === 3),
  });
});

export const armsBig = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const result = arms(vertexIndex, time);
  return LineSegmentVertex({
    position: result.position,
    radius: select(0.275, 0.1, vertexIndex === 2 || vertexIndex === 3),
  });
});

export const armsRotating = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const s = sin(time);
  const c = cos(time);
  const r = 0.25;
  const points = [
    vec2f(r * s - 0.25, r * c),
    vec2f(-0.25, 0),
    vec2f(0.25, 0),
    vec2f(-r * s + 0.25, -r * c),
  ];
  const i = clamp(i32(vertexIndex) - 1, 0, 3);
  return LineSegmentVertex({
    position: points[i],
    radius: 0.2,
  });
});

export const flyingSquares = testCaseShell((vertexIndex, time) => {
  'use gpu';
  const squareIndex = u32(vertexIndex / 8);
  randf.seed(f32(squareIndex + 5));
  const squarePoints = [vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, 1)];
  const pointIndex = vertexIndex % 8;
  const point = squarePoints[pointIndex % 4];
  const rotationSpeed = 2 * randf.sample() - 1;
  const s = sin(time * rotationSpeed);
  const c = cos(time * rotationSpeed);
  const rotate = mat2x2f(c, -s, s, c);
  const r = 0.1 + 0.05 * randf.sample();
  const x = 2.0 * randf.sample() - 1;
  const y = 2.0 * randf.sample() - 1;
  const transformedPoint = add(vec2f(x, y), mul(rotate, mul(point, r)));
  return LineSegmentVertex({
    position: transformedPoint,
    radius: select(0.1 * r + 0.05 * randf.sample(), -1, pointIndex === 7 || squareIndex > 50),
  });
});

import { d, std } from 'typegpu';

export const TriangleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

export const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
};

export const getRotationFromVelocity = (velocity: d.v2f) => {
  'use gpu';
  return -std.atan2(velocity.x, velocity.y);
};

import type { Vec2 } from './vectorImpl.ts';
import type { m2x2f, v2f } from './wgslTypes.ts';

function unaryComponentWise2(op: (lhs: number) => number) {
  return (lhs: Vec2<number>) => new lhs._Vec2(op(lhs[0]), op(lhs[1]));
}

function binaryComponentWise2(op: (lhs: number, rhs: number) => number) {
  return (lhs: Vec2<number>, rhs: Vec2<number>) =>
    new lhs._Vec2(op(lhs[0], rhs[0]), op(lhs[1], rhs[1]));
}

export const mulV2xS = (lhs: Vec2<number>, rhs: number) =>
  unaryComponentWise2((lhs) => lhs * rhs)(lhs);

export const mulV2xV2 = binaryComponentWise2((lhs, rhs) => lhs * rhs);

export function mulV2xM2(lhs: Vec2<number>, rhs: m2x2f): Vec2<number> {
  const rhs_ = rhs.columns as [v2f, v2f];
  return new lhs._Vec2(
    lhs[0] * rhs_[0].x + lhs[1] * rhs_[0].y,
    lhs[0] * rhs_[1].x + lhs[1] * rhs_[1].y,
  );
}

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

export function mulV2xV2(
  lhs: Tuple2<number>,
  rhs: Tuple2<number>,
): Tuple2<number> {
  return [lhs[0] * rhs[0], lhs[1] * rhs[1]];
}

export function mulV2xS(lhs: Tuple2<number>, rhs: number): Tuple2<number> {
  return [lhs[0] * rhs, lhs[1] * rhs];
}

export function mulV2xM2(
  lhs: Tuple2<number>,
  rhs: Tuple2<Tuple2<number>>,
): Tuple2<number> {
  return [
    lhs[0] * rhs[0][0] + lhs[1] * rhs[0][1],
    lhs[0] * rhs[1][0] + lhs[1] * rhs[1][1],
  ];
}

// export function mulVxV3(
//   lhs: Tuple3<S>,
//   rhs: Tuple3<S>,
// ): Tuple3<S> {
//   return [lhs[0] * rhs[0], lhs[1] * rhs[1], lhs[2] * rhs[2]];
// }

// export function mulVxV4(
//   lhs: Tuple4<S>,
//   rhs: Tuple4<S>,
// ): Tuple4<S> {
//   return [lhs[0] * rhs[0], lhs[1] * rhs[1], lhs[2] * rhs[2], lhs[3] * rhs[3]];
// }

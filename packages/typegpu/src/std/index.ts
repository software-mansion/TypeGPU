export { discard } from './discard.ts';

// deno-fmt-ignore
export {
  // ops
  add,
  sub,
  mul,
  div,
  // builtin functions
  abs,
  acos,
  acosh,
  asin,
  atan2,
  ceil,
  clamp,
  cos,
  cosh,
  cross,
  distance,
  dot,
  exp,
  exp2,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  neg,
  normalize,
  pow,
  reflect,
  sign,
  sin,
  sqrt,
  tanh
} from './numeric.ts';

// deno-fmt-ingore
export { rotateX4, rotateY4, rotateZ4, scale4, translate4 } from './matrix.ts';

// deno-fmt-ingore
export {
  identity2,
  identity3,
  identity4,
  rotationX4,
  rotationY4,
  rotationZ4,
  scaling4,
  translation4,
} from '../data/matrix.ts';

// deno-fmt-ignore
export {
  // comparison
  allEq,
  eq,
  ne,
  lt,
  le,
  gt,
  ge,
  // logical ops
  not,
  or,
  and,
  // logical aggregation
  all,
  any,
  // other
  isCloseTo,
  select,
} from './boolean.ts';

// deno-fmt-ignore
export {
  atomicAdd,
  atomicAnd,
  atomicLoad,
  atomicMax,
  atomicMin,
  atomicOr,
  atomicStore,
  atomicSub,
  atomicXor,
  // synchronization
  workgroupBarrier,
  storageBarrier,
  textureBarrier,
} from './atomic.ts';

export { arrayLength } from './array.ts';

// deno-fmt-ignore
export {
  pack4x8unorm,
  pack2x16float,
  unpack4x8unorm,
  unpack2x16float,
} from './packing.ts';

export {
  textureDimensions,
  textureLoad,
  textureSample,
  textureSampleLevel,
  textureStore,
} from './texture.ts';

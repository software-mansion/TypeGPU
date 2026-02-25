/**
 * @module typegpu/std
 */

// NOTE: This is a barrel file, internal files should not import things from this file

export { discard } from './discard.ts';

export {
  abs,
  acos,
  acosh,
  asin,
  asinh,
  atan,
  atan2,
  atanh,
  ceil,
  clamp,
  cos,
  cosh,
  countLeadingZeros,
  countOneBits,
  countTrailingZeros,
  cross,
  degrees,
  determinant,
  distance,
  dot,
  dot4I8Packed,
  dot4U8Packed,
  exp,
  exp2,
  extractBits,
  faceForward,
  firstLeadingBit,
  firstTrailingBit,
  floor,
  fma,
  fract,
  frexp,
  insertBits,
  inverseSqrt,
  ldexp,
  length,
  log,
  log2,
  max,
  min,
  mix,
  modf,
  normalize,
  pow,
  quantizeToF16,
  radians,
  reflect,
  refract,
  reverseBits,
  round,
  saturate,
  sign,
  sin,
  sinh,
  smoothstep,
  sqrt,
  step,
  tan,
  tanh,
  transpose,
  trunc,
} from './numeric.ts';

export { add, div, mod, mul, neg, sub } from './operators.ts';

export { rotateX4, rotateY4, rotateZ4, scale4, translate4 } from './matrix.ts';

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

export {
  dpdx,
  dpdxCoarse,
  dpdxFine,
  dpdy,
  dpdyCoarse,
  dpdyFine,
  fwidth,
  fwidthCoarse,
  fwidthFine,
} from './derivative.ts';

export { arrayLength } from './array.ts';

// oxfmt-ignore
export {
  pack4x8unorm,
  pack2x16float,
  unpack4x8unorm,
  unpack2x16float,
} from './packing.ts';

export {
  textureDimensions,
  textureGather,
  textureLoad,
  textureSample,
  textureSampleBaseClampToEdge,
  textureSampleBias,
  textureSampleCompare,
  textureSampleCompareLevel,
  textureSampleLevel,
  textureStore,
} from './texture.ts';

export {
  subgroupAdd,
  subgroupAll,
  subgroupAnd,
  subgroupAny,
  subgroupBallot,
  subgroupBroadcast,
  subgroupBroadcastFirst,
  subgroupElect,
  subgroupExclusiveAdd,
  subgroupExclusiveMul,
  subgroupInclusiveAdd,
  subgroupInclusiveMul,
  subgroupMax,
  subgroupMin,
  subgroupMul,
  subgroupOr,
  subgroupShuffle,
  subgroupShuffleDown,
  subgroupShuffleUp,
  subgroupShuffleXor,
  subgroupXor,
} from './subgroup.ts';

export { extensionEnabled } from './extensions.ts';

export { bitcastU32toF32, bitcastU32toI32 } from './bitcast.ts';

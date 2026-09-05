/**
 * @module typegpu/std
 */

// NOTE: This is a barrel file, internal files should not import things from this file

export { copy } from './copy.ts';

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
  intdiv,
} from './numeric.ts';

export { add, bitShiftLeft, bitShiftRight, div, mod, mul, neg, sub } from './operators.ts';

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
  atomicCompareExchangeWeak,
  atomicExchange,
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
  workgroupUniformLoad,
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
  pack2x16float,
  pack2x16snorm,
  pack2x16unorm,
  pack4x8snorm,
  pack4x8unorm,
  pack4xI8,
  pack4xI8Clamp,
  pack4xU8,
  pack4xU8Clamp,
  unpack2x16float,
  unpack2x16snorm,
  unpack2x16unorm,
  unpack4x8snorm,
  unpack4x8unorm,
  unpack4xI8,
  unpack4xU8,
} from './packing.ts';

export {
  textureDimensions,
  textureGather,
  textureGatherCompare,
  textureLoad,
  textureNumLayers,
  textureNumLevels,
  textureNumSamples,
  textureSample,
  textureSampleBaseClampToEdge,
  textureSampleBias,
  textureSampleCompare,
  textureSampleCompareLevel,
  textureSampleGrad,
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

export { quadBroadcast, quadSwapDiagonal, quadSwapX, quadSwapY } from './quad.ts';

export { extensionEnabled } from './extensions.ts';

export { bitcastU32toF32, bitcastU32toI32, bitcastF32toU32, bitcast } from './bitcast.ts';

export { range } from './range.ts';

export { isBeingTranspiled, getTargetShaderLanguage, getShaderStage } from './environment.ts';

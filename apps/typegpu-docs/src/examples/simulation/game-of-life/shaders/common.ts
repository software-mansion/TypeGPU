import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const computeLayout = tgpu.bindGroupLayout({
  current: { texture: d.texture2d(d.u32) },
  next: { storageTexture: d.textureStorage2d('r32uint') },
  sampler: { sampler: 'non-filtering' },
});

export const displayLayout = tgpu.bindGroupLayout({
  source: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
});

export const TILE_SIZE = 16;
export const BITS_PER_CELL = 32;

export const gameSizeAccessor = tgpu['~unstable'].accessor(d.u32, 64);

export const loadTexAt = (pos: d.v2u): number => {
  'use gpu';
  return std.textureLoad(computeLayout.$.current, pos, 0).x;
};

export const Neighborhood3x3 = d.struct({
  tl: d.u32,
  tc: d.u32,
  tr: d.u32,
  ml: d.u32,
  mc: d.u32,
  mr: d.u32,
  bl: d.u32,
  bc: d.u32,
  br: d.u32,
});

/** 8 neighbors around a cell */
export const Neighbors8 = d.struct({
  nw: d.u32,
  n: d.u32,
  ne: d.u32,
  w: d.u32,
  e: d.u32,
  sw: d.u32,
  s: d.u32,
  se: d.u32,
});

/**
 * Gather a 3x3 neighborhood using 4 textureGather calls.
 * textureGather returns 4 texels: .w=(x,y) .z=(x+1,y) .x=(x,y+1) .y=(x+1,y+1)
 */
export const gatherNeighborhood = (
  texture: d.texture2d<d.U32>,
  sampler: d.sampler,
  uv: d.v2f,
  texelSize: d.v2f,
): d.Infer<typeof Neighborhood3x3> => {
  'use gpu';

  const g1 = std.textureGather(0, texture, sampler, uv);
  const g2 = std.textureGather(
    0,
    texture,
    sampler,
    uv.add(d.vec2f(texelSize.x, 0)),
  );
  const g3 = std.textureGather(
    0,
    texture,
    sampler,
    uv.add(d.vec2f(0, texelSize.y)),
  );
  const g4 = std.textureGather(0, texture, sampler, uv.add(texelSize));

  return Neighborhood3x3({
    tl: d.u32(g1.w),
    tc: d.u32(g1.z),
    tr: d.u32(g2.z),
    ml: d.u32(g1.x),
    mc: d.u32(g1.y),
    mr: d.u32(g2.y),
    bl: d.u32(g3.x),
    bc: d.u32(g3.y),
    br: d.u32(g4.y),
  });
};

/** Extract the 8 neighbors from a 3x3 neighborhood */
export const extractNeighbors = (
  n: d.Infer<typeof Neighborhood3x3>,
): d.Infer<typeof Neighbors8> => {
  'use gpu';
  return Neighbors8({
    nw: n.tl,
    n: n.tc,
    ne: n.tr,
    w: n.ml,
    e: n.mr,
    sw: n.bl,
    s: n.bc,
    se: n.br,
  });
};

/** Count neighbors (sum of 8 u32 values, each 0 or 1) */
export const countNeighbors = (n: d.Infer<typeof Neighbors8>): number => {
  'use gpu';
  return n.nw + n.n + n.ne + n.w + n.e + n.sw + n.s + n.se;
};

/**
 * Shift neighborhood for bitpacked left neighbors.
 * Left neighbor of bit i is bit i-1, or bit 31 of left u32 if i=0.
 */
export const shiftLeft = (center: number, left: number): number => {
  'use gpu';
  return (center << 1) | (left >> 31);
};

/**
 * Shift neighborhood for bitpacked right neighbors.
 * Right neighbor of bit i is bit i+1, or bit 0 of right u32 if i=31.
 */
export const shiftRight = (center: number, right: number): number => {
  'use gpu';
  return (center >> 1) | (right << 31);
};

/** Get bitpacked neighbors from a 3x3 neighborhood of packed u32s */
export const bitpackedNeighbors = (
  n: d.Infer<typeof Neighborhood3x3>,
): d.Infer<typeof Neighbors8> => {
  'use gpu';
  return Neighbors8({
    nw: shiftLeft(n.tc, n.tl),
    n: n.tc,
    ne: shiftRight(n.tc, n.tr),
    w: shiftLeft(n.mc, n.ml),
    e: shiftRight(n.mc, n.mr),
    sw: shiftLeft(n.bc, n.bl),
    s: n.bc,
    se: shiftRight(n.bc, n.br),
  });
};

/**
 * Parallel bit count using Wallace tree of full/half adders.
 * Counts 8 single-bit values per bit position, returns 4-bit result per position.
 */
export const parallelCount8 = (
  n: d.Infer<typeof Neighbors8>,
): number[] => {
  'use gpu';

  // Level 1: Reduce 8 -> 6 using 2 full adders + 1 half adder
  const fa1_s = n.nw ^ n.n ^ n.ne;
  const fa1_c = (n.nw & n.n) | (n.n & n.ne) | (n.nw & n.ne);
  const fa2_s = n.w ^ n.e ^ n.sw;
  const fa2_c = (n.w & n.e) | (n.e & n.sw) | (n.w & n.sw);
  const ha1_s = n.s ^ n.se;
  const ha1_c = n.s & n.se;

  // Level 2: Combine weight-1 values
  const fa3_s = fa1_s ^ fa2_s ^ ha1_s;
  const fa3_c = (fa1_s & fa2_s) | (fa2_s & ha1_s) | (fa1_s & ha1_s);

  // Level 2: Combine weight-2 values
  const fa4_s = fa1_c ^ fa2_c ^ ha1_c;
  const fa4_c = (fa1_c & fa2_c) | (fa2_c & ha1_c) | (fa1_c & ha1_c);
  const ha2_s = fa4_s ^ fa3_c;
  const ha2_c = fa4_s & fa3_c;

  // Level 3: Combine weight-4 values
  const ha3_s = fa4_c ^ ha2_c;
  const ha3_c = fa4_c & ha2_c;

  return [fa3_s, ha2_s, ha3_s, ha3_c];
};

/**
 * Apply Game of Life rules using bitpacked parallel count.
 * Returns u32 mask where bit i is 1 if cell i should be alive.
 */
export const golNextStateBitpacked = (
  current: number,
  count: number[],
): number => {
  'use gpu';

  // count==2: 0010 binary -> bit3=0, bit2=0, bit1=1, bit0=0
  // count==3: 0011 binary -> bit3=0, bit2=0, bit1=1, bit0=1
  const not0 = count[0] ^ 0xFFFFFFFF;
  const not2 = count[2] ^ 0xFFFFFFFF;
  const not3 = count[3] ^ 0xFFFFFFFF;

  const is_2 = not3 & not2 & count[1] & not0;
  const is_3 = not3 & not2 & count[1] & count[0];

  return is_3 | (is_2 & current);
};

export const golNextState = (alive: boolean, neighbors: number): boolean => {
  'use gpu';
  return (alive && (neighbors === 2 || neighbors === 3)) ||
    (!alive && neighbors === 3);
};

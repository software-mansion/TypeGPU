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

// deno-fmt-ignore
export const Neighborhood3x3 = d.struct({
  tl: d.u32, tc: d.u32, tr: d.u32,
  ml: d.u32, mc: d.u32, mr: d.u32,
  bl: d.u32, bc: d.u32, br: d.u32,
});

// deno-fmt-ignore
export const Neighbors8 = d.struct({
  nw: d.u32, n: d.u32, ne: d.u32,
  w: d.u32,            e: d.u32,
  sw: d.u32, s: d.u32, se: d.u32,
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
  // Gather 4 texels at a time
  // .w=(x,y) .z=(x+1,y) .x=(x,y+1) .y=(x+1,y+1)
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

  // deno-fmt-ignore
  return Neighborhood3x3({
     tl: d.u32(g1.w), tc: d.u32(g1.z), tr: d.u32(g2.z),
     ml: d.u32(g1.x), mc: d.u32(g1.y), mr: d.u32(g2.y),
     bl: d.u32(g3.x), bc: d.u32(g3.y), br: d.u32(g4.y),
   });
};

export const extractNeighbors = (
  n: d.Infer<typeof Neighborhood3x3>,
): d.Infer<typeof Neighbors8> => {
  'use gpu';
  // deno-fmt-ignore
  return Neighbors8({
    nw: n.tl, n: n.tc, ne: n.tr,
    w:  n.ml,           e: n.mr,
    sw: n.bl, s: n.bc, se: n.br,
  });
};

export const countNeighbors = (n: d.Infer<typeof Neighbors8>): number => {
  'use gpu';
  return n.nw + n.n + n.ne + n.w + n.e + n.sw + n.s + n.se;
};

export const shiftLeft = (center: number, left: number): number => {
  'use gpu';
  return (center << 1) | (left >> 31);
};

export const shiftRight = (center: number, right: number): number => {
  'use gpu';
  return (center >> 1) | (right << 31);
};

export const bitpackedNeighbors = (
  n: d.Infer<typeof Neighborhood3x3>,
): d.Infer<typeof Neighbors8> => {
  'use gpu';
  // deno-fmt-ignore
  return Neighbors8({
    nw: shiftLeft(n.tc, n.tl), n: n.tc, ne: shiftRight(n.tc, n.tr),
    w:  shiftLeft(n.mc, n.ml),          e:  shiftRight(n.mc, n.mr),
    sw: shiftLeft(n.bc, n.bl), s: n.bc, se: shiftRight(n.bc, n.br),
  });
};

/**
 * Parallel bit count using Wallace tree of full/half adders.
 * Counts 8 single-bit values per bit position, returns 4-bit result per position.
 */
export const parallelCount8 = (n: d.Infer<typeof Neighbors8>): number[] => {
  'use gpu';

  // Full Adder: 3 inputs -> Sum (weight 1), Carry (weight 2)
  // Sum = a ^ b ^ c
  // Carry = (a & b) | (c & (a ^ b))

  const l1_sum_a = n.nw ^ n.n ^ n.ne;
  const l1_car_a = (n.nw & n.n) | (n.ne & (n.nw ^ n.n));

  const l1_sum_b = n.w ^ n.e ^ n.sw;
  const l1_car_b = (n.w & n.e) | (n.sw & (n.w ^ n.e));

  const l1_sum_c = n.s ^ n.se;
  const l1_car_c = n.s & n.se;

  // We now have:
  // Weight 1: [l1_sum_a, l1_sum_b, l1_sum_c]
  // Weight 2: [l1_car_a, l1_car_b, l1_car_c]

  // Add the three Weight-1 bits to get Final Bit 0
  const bit0 = l1_sum_a ^ l1_sum_b ^ l1_sum_c;
  const l2_car_a = (l1_sum_a & l1_sum_b) | (l1_sum_c & (l1_sum_a ^ l1_sum_b)); // Carry to W2

  // Add the three Weight-2 bits
  const l2_sum_b = l1_car_a ^ l1_car_b ^ l1_car_c;
  const l2_car_b = (l1_car_a & l1_car_b) | (l1_car_c & (l1_car_a ^ l1_car_b)); // Carry to W4

  // We now have:
  // Weight 2: [l2_car_a, l2_sum_b] (Need to add these)
  // Weight 4: [l2_car_b]

  const bit1 = l2_car_a ^ l2_sum_b;
  const l3_car_a = l2_car_a & l2_sum_b; // Carry to W4

  // We now have:
  // Weight 4: [l2_car_b, l3_car_a] (Need to add these)

  const bit2 = l2_car_b ^ l3_car_a;
  const bit3 = l2_car_b & l3_car_a; // Carry to W8 (Bit 3)

  return [bit0, bit1, bit2, bit3];
};

export const golNextStateBitpacked = (
  current: number,
  count: number[],
): number => {
  'use gpu';

  const bit0 = count[0];
  const bit1 = count[1];
  const bit2 = count[2];
  const bit3 = count[3];

  const two_or_three = bit1 & (~bit2) & (~bit3);

  return two_or_three & (bit0 | current);
};

export const golNextState = (alive: boolean, neighbors: number): boolean => {
  'use gpu';
  return (alive && (neighbors === 2 || neighbors === 3)) ||
    (!alive && neighbors === 3);
};

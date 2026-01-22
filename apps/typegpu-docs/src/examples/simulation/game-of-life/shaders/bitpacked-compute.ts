import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { bitpackedLayout, gameSizeAccessor, TILE_SIZE } from './common.ts';

export const bitpackedCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const gameSize = gameSizeAccessor.$;
  const packedWidth = d.u32(gameSize / 32);

  if (gid.x >= packedWidth || gid.y >= gameSize) {
    return;
  }

  //   .w = (x, y)      .z = (x+1, y)
  //   .x = (x, y+1)    .y = (x+1, y+1)

  const texelX = 1.0 / packedWidth;
  const texelY = 1.0 / gameSize;
  const uv = d.vec2f(gid.xy).mul(d.vec2f(texelX, texelY));

  // g1 at (px, py): tl(.w), tc(.z), ml(.x), mc(.y)
  const g1 = std.textureGather(
    0,
    bitpackedLayout.$.current,
    bitpackedLayout.$.sampler,
    uv,
  );

  // g2 at (px+1, py): tc(.w), tr(.z), mc(.x), mr(.y)
  const g2 = std.textureGather(
    0,
    bitpackedLayout.$.current,
    bitpackedLayout.$.sampler,
    uv.add(d.vec2f(texelX, 0)),
  );

  // g3 at (px, py+1): ml(.w), mc(.z), bl(.x), bc(.y)
  const g3 = std.textureGather(
    0,
    bitpackedLayout.$.current,
    bitpackedLayout.$.sampler,
    uv.add(d.vec2f(0, texelY)),
  );

  // g4 at (px+1, py+1): mc(.w), mr(.z), bc(.x), br(.y)
  const g4 = std.textureGather(
    0,
    bitpackedLayout.$.current,
    bitpackedLayout.$.sampler,
    uv.add(d.vec2f(texelX, texelY)),
  );

  // Extract the 9 values (sampler handles edge clamping)
  const tl = d.u32(g1.w);
  const tc = d.u32(g1.z);
  const tr = d.u32(g2.z);
  const ml = d.u32(g1.x);
  const mc = d.u32(g1.y);
  const mr = d.u32(g2.y);
  const bl = d.u32(g3.x);
  const bc = d.u32(g3.y);
  const br = d.u32(g4.y);

  // For each bit position i in mc (current cell's packed row):
  // Global x = px * 32 + i
  // Left neighbor (x-1): bit i-1 of same u32, or bit 31 of left u32 if i=0
  // Right neighbor (x+1): bit i+1 of same u32, or bit 0 of right u32 if i=31

  // Compute shifted versions for left/right neighbors
  // Left neighbors: (tc << 1) shifts bits up, bringing in 0 at bit 0
  //                 (tl >> 31) puts bit 31 of left u32 into bit 0
  const tc_l = (tc << 1) | (tl >> 31);
  const mc_l = (mc << 1) | (ml >> 31);
  const bc_l = (bc << 1) | (bl >> 31);

  // Right neighbors: (tc >> 1) shifts bits down, bringing in 0 at bit 31
  //                  (tr << 31) puts bit 0 of right u32 into bit 31
  const tc_r = (tc >> 1) | (tr << 31);
  const mc_r = (mc >> 1) | (mr << 31);
  const bc_r = (bc >> 1) | (br << 31);

  // 8 neighbor masks (bit i = 1 if that neighbor of cell i is alive)
  const n0 = tc_l; // NW
  const n1 = tc; // N
  const n2 = tc_r; // NE
  const n3 = mc_l; // W
  const n4 = mc_r; // E
  const n5 = bc_l; // SW
  const n6 = bc; // S
  const n7 = bc_r; // SE

  // Count neighbors using Wallace tree of full/half adders
  // Full adder: (a,b,c) -> sum = a^b^c, carry = (a&b)|(b&c)|(a&c)

  // Level 1: Reduce 8 -> 6 using 2 FAs + 1 HA
  const fa1_s = n0 ^ n1 ^ n2;
  const fa1_c = (n0 & n1) | (n1 & n2) | (n0 & n2);
  const fa2_s = n3 ^ n4 ^ n5;
  const fa2_c = (n3 & n4) | (n4 & n5) | (n3 & n5);
  const ha1_s = n6 ^ n7;
  const ha1_c = n6 & n7;

  // Level 2: Weight-1 values (fa1_s, fa2_s, ha1_s) -> FA
  const fa3_s = fa1_s ^ fa2_s ^ ha1_s;
  const fa3_c = (fa1_s & fa2_s) | (fa2_s & ha1_s) | (fa1_s & ha1_s);

  // Level 2: Weight-2 values (fa1_c, fa2_c, ha1_c, fa3_c) -> FA + HA
  const fa4_s = fa1_c ^ fa2_c ^ ha1_c;
  const fa4_c = (fa1_c & fa2_c) | (fa2_c & ha1_c) | (fa1_c & ha1_c);
  const ha2_s = fa4_s ^ fa3_c;
  const ha2_c = fa4_s & fa3_c;

  // Level 3: Weight-4 values (fa4_c, ha2_c)
  const ha3_s = fa4_c ^ ha2_c;
  const ha3_c = fa4_c & ha2_c;

  // Final sum bits:
  // bit0 = fa3_s (weight 1)
  // bit1 = ha2_s (weight 2)
  // bit2 = ha3_s (weight 4)
  // bit3 = ha3_c (weight 8)

  const bit0 = fa3_s;
  const bit1 = ha2_s;
  const bit2 = ha3_s;
  const bit3 = ha3_c;

  // GoL rules: alive if count==3 OR (alive AND count==2)
  // count==2: bit3=0, bit2=0, bit1=1, bit0=0
  // count==3: bit3=0, bit2=0, bit1=1, bit0=1

  const not_bit0 = bit0 ^ 0xFFFFFFFF;
  const not_bit2 = bit2 ^ 0xFFFFFFFF;
  const not_bit3 = bit3 ^ 0xFFFFFFFF;

  const is_2 = not_bit3 & not_bit2 & bit1 & not_bit0;
  const is_3 = not_bit3 & not_bit2 & bit1 & bit0;

  const next = is_3 | (is_2 & mc);

  std.textureStore(
    bitpackedLayout.$.next,
    gid.xy,
    d.vec4u(next, 0, 0, 0),
  );
});

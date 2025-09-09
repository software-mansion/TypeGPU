import { describe, expect, it } from 'vitest';
import * as std from '../../src/std/index.ts';
import {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from '../../src/data/vector.ts';

describe('bitcast', () => {
  it('checksEndian', () => {
    // this may break bitcast on big-endian systems
    const endian = std.checkEndian();
    expect(endian).toBe('little endian'); // for ARM Macs
  });
  it('bitcastU32toF32', () => {
    // 1.0 in f32
    //0 01111111 00000000000000000000000
    const f = std.bitcastU32toF32(1065353216);
    expect(f).toBeCloseTo(1.0);

    // -1 in f32
    //1 11111111 00000000000000000000000
    const f2 = std.bitcastU32toF32(3212836864);
    expect(f2).toBeCloseTo(-1.0);
  });

  it('bitcastU32toI32', () => {
    // -1 in i32
    // 11111111111111111111111111111111
    const i = std.bitcastU32toI32(4294967295);
    expect(i).toBe(-1);

    // -2147483648 in i32
    // 10000000000000000000000000000000
    const i2 = std.bitcastU32toI32(2147483648);
    expect(i2).toBe(-2147483648);
  });

  it('bitcastU32toF32 vectors', () => {
    const v2 = vec2u(1065353216, 3212836864); // 1.0f, -1.0f
    const cast2 = std.bitcastU32toF32(v2);
    expect(std.isCloseTo(cast2, vec2f(1.0, -1.0))).toBe(true);

    const v3 = vec3u(0, 1065353216, 3212836864); // 0.0f, 1.0f, -1.0f
    const cast3 = std.bitcastU32toF32(v3);
    expect(
      std.isCloseTo(cast3, vec3f(0.0, 1.0, -1.0)),
    ).toBe(true);

    const v4 = vec4u(0, 1065353216, 3212836864, 0); // 0,1,-1,0
    const cast4 = std.bitcastU32toF32(v4);
    expect(
      std.isCloseTo(
        cast4,
        vec4f(0.0, 1.0, -1.0, 0.0),
      ),
    ).toBe(true);
  });

  it('bitcastU32toI32 vectors', () => {
    const v2 = vec2u(4294967295, 2147483648); // -1, -2147483648
    const cast2 = std.bitcastU32toI32(v2); // int vector
    expect(cast2).toEqual(vec2i(-1, -2147483648));

    const v3 = vec3u(0, 4294967295, 2147483648);
    const cast3 = std.bitcastU32toI32(v3);
    expect(cast3).toEqual(vec3i(0, -1, -2147483648));

    const v4 = vec4u(0, 1, 4294967295, 2147483648);
    const cast4 = std.bitcastU32toI32(v4);
    expect(cast4).toEqual(vec4i(0, 1, -1, -2147483648));
  });
});

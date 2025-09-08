import { describe, expect, it } from 'vitest';
import {
  bitcastU32toF32,
  bitcastU32toI32,
  checkEndian,
} from '../../src/std/index.ts';

describe('bitcast', () => {
  it('checksEndian', () => {
    // this may break bitcast tests on big-endian systems
    const endian = checkEndian();
    expect(endian).toBe('little endian'); // for ARM Macs
  });
  it('bitcastU32toF32', () => {
    // 1.0 in f32
    //0 01111111 00000000000000000000000
    const f = bitcastU32toF32(1065353216);
    expect(f).toBeCloseTo(1.0);

    // -1 in f32
    //1 11111111 00000000000000000000000
    const f2 = bitcastU32toF32(3212836864);
    expect(f2).toBeCloseTo(-1.0);

  });

    it('bitcastU32toI32', () => {
        // -1 in i32
    // 11111111111111111111111111111111
    const i = bitcastU32toI32(4294967295);
    expect(i).toBe(-1);

    // -2147483648 in i32
    // 10000000000000000000000000000000
    const i2 = bitcastU32toI32(2147483648);
    expect(i2).toBe(-2147483648);
  });
});

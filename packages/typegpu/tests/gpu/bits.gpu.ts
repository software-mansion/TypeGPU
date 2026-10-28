import { d, std } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import { I32_MIN, mapOnGpu, U32_MAX } from './utils.ts';

// More integer builtins without a CPU implementation, checked against references written
// here from the WGSL spec.

const unsigned = [
  0,
  1,
  2,
  3,
  255,
  256,
  0x7fffffff,
  0x80000000,
  0x00010000,
  12_345_678,
  0xdeadbeef,
  U32_MAX,
];
const signed = [0, 1, -1, -2, 255, -256, 0x7fffffff, I32_MIN, 123_456, -123_456, -0x12345678];

const popcount = (x: number) => {
  let bits = x >>> 0;
  let count = 0;
  while (bits) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
};
const ctz = (x: number) => (x === 0 ? 32 : 31 - Math.clz32((x & -x) >>> 0));
const reverse = (x: number) => {
  let bits = x >>> 0;
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = ((result << 1) | (bits & 1)) >>> 0;
    bits >>>= 1;
  }
  return result;
};

describe('countOneBits on a real device', () => {
  gpuIt('u32', async ({ root }) => {
    const result = await mapOnGpu(root, d.u32, d.u32, unsigned, (x) => {
      'use gpu';
      return std.countOneBits(x);
    });
    expect(result).toStrictEqual(unsigned.map(popcount));
  });

  gpuIt('i32 counts the bits of the two-complement representation', async ({ root }) => {
    const result = await mapOnGpu(root, d.i32, d.i32, signed, (x) => {
      'use gpu';
      return std.countOneBits(x);
    });
    expect(result).toStrictEqual(signed.map(popcount));
  });

  gpuIt('applies per component on vec4u', async ({ root }) => {
    const result = await mapOnGpu(root, d.vec4u, d.vec4u, [d.vec4u(0, 1, 3, U32_MAX)], (x) => {
      'use gpu';
      return std.countOneBits(x);
    });
    expect(result).toStrictEqual([d.vec4u(0, 1, 2, 32)]);
  });
});

describe('firstTrailingBit on a real device', () => {
  gpuIt('u32 returns the index of the lowest set bit, all ones for 0', async ({ root }) => {
    const result = await mapOnGpu(root, d.u32, d.u32, unsigned, (x) => {
      'use gpu';
      return std.firstTrailingBit(x);
    });
    expect(result).toStrictEqual(unsigned.map((x) => (x === 0 ? U32_MAX : ctz(x))));
  });

  gpuIt('i32 returns the index of the lowest set bit, -1 for 0', async ({ root }) => {
    const result = await mapOnGpu(root, d.i32, d.i32, signed, (x) => {
      'use gpu';
      return std.firstTrailingBit(x);
    });
    expect(result).toStrictEqual(signed.map((x) => (x === 0 ? -1 : ctz(x))));
  });

  gpuIt('applies per component on vec3i', async ({ root }) => {
    const result = await mapOnGpu(root, d.vec3i, d.vec3i, [d.vec3i(0, 8, -2)], (x) => {
      'use gpu';
      return std.firstTrailingBit(x);
    });
    expect(result).toStrictEqual([d.vec3i(-1, 3, 1)]);
  });
});

describe('reverseBits on a real device', () => {
  gpuIt('u32', async ({ root }) => {
    const result = await mapOnGpu(root, d.u32, d.u32, unsigned, (x) => {
      'use gpu';
      return std.reverseBits(x);
    });
    expect(result).toStrictEqual(unsigned.map(reverse));
  });

  gpuIt('i32 reverses the two-complement representation', async ({ root }) => {
    const result = await mapOnGpu(root, d.i32, d.i32, signed, (x) => {
      'use gpu';
      return std.reverseBits(x);
    });
    expect(result).toStrictEqual(signed.map((x) => reverse(x) | 0));
  });

  gpuIt('is its own inverse', async ({ root }) => {
    const twice = await mapOnGpu(root, d.u32, d.u32, unsigned, (x) => {
      'use gpu';
      return std.reverseBits(std.reverseBits(x));
    });
    expect(twice).toStrictEqual(unsigned);
  });
});

describe('dot4I8Packed on a real device', () => {
  const Pair = d.struct({ a: d.u32, b: d.u32 });
  const int8 = (byte: number) => (byte << 24) >> 24;
  const reference = (a: number, b: number) =>
    [0, 8, 16, 24].reduce(
      (sum, shift) => sum + int8((a >>> shift) & 0xff) * int8((b >>> shift) & 0xff),
      0,
    );

  gpuIt('multiplies the four signed bytes pairwise and sums them', async ({ root }) => {
    const cases = [
      [0x01020304, 0x05060708],
      [U32_MAX, U32_MAX], // -1 * -1 * 4
      [0x80808080, 0x80808080], // -128 * -128 * 4
      [0x7f7f7f7f, 0x80808080], // 127 * -128 * 4
      [0xff01fe02, 0x01ff02fe],
      [0, 0x12345678],
    ] as const;
    const result = await mapOnGpu(
      root,
      Pair,
      d.i32,
      cases.map(([a, b]) => ({ a, b })),
      (p) => {
        'use gpu';
        return std.dot4I8Packed(p.a, p.b);
      },
    );
    expect(result).toStrictEqual(cases.map(([a, b]) => reference(a, b)));
  });
});

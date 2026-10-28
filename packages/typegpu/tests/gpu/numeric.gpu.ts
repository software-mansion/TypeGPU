import { d, std, type TgpuRoot } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';

// These std functions have no CPU implementation, so the only way to check what they compute
// is to run them on a device and compare with a reference written here from the WGSL spec.

const U32_MAX = 0xffffffff;
const I32_MIN = -0x80000000;

/** Applies `f` to every element of `values` on the GPU, one thread per element. */
async function mapOnGpu<In extends d.AnyWgslData, Out extends d.AnyWgslData>(
  root: TgpuRoot,
  inSchema: In,
  outSchema: Out,
  values: d.InferInput<In>[],
  f: (x: d.Infer<In>) => d.Infer<Out>,
): Promise<d.Infer<Out>[]> {
  const input = root.createReadonly(d.arrayOf(inSchema, values.length), values);
  const output = root.createMutable(d.arrayOf(outSchema, values.length));

  root
    .createGuardedComputePipeline((i) => {
      'use gpu';
      output.$[i] = f(input.$[i] as d.Infer<In>) as d.InferGPU<Out>;
    })
    .dispatchThreads(values.length);

  return (await output.read()) as d.Infer<Out>[];
}

const u32 = (value: bigint) => Number(BigInt.asUintN(32, value));
const i32 = (value: bigint) => Number(BigInt.asIntN(32, value));
const mask = (count: number) => (1n << BigInt(count)) - 1n;

const clz = (x: number) => Math.clz32(x);
const ctz = (x: number) => (x === 0 ? 32 : 31 - Math.clz32((x & -x) >>> 0));
const firstLeadingBitU = (x: number) => (x === 0 ? U32_MAX : 31 - Math.clz32(x));
const firstLeadingBitI = (x: number) => {
  if (x === 0 || x === -1) {
    return -1;
  }
  return x > 0 ? 31 - Math.clz32(x) : 31 - Math.clz32(~x >>> 0);
};

const extractU = (e: number, offset: number, count: number) =>
  u32((BigInt(e) >> BigInt(offset)) & mask(count));
const extractI = (e: number, offset: number, count: number) => {
  if (count === 0) {
    return 0;
  }
  const field = (BigInt.asUintN(32, BigInt(e)) >> BigInt(offset)) & mask(count);
  const signBit = 1n << BigInt(count - 1);
  return Number(field & signBit ? field - (1n << BigInt(count)) : field);
};

const insertU = (e: number, bits: number, offset: number, count: number) => {
  const field = mask(count) << BigInt(offset);
  return u32((BigInt(e) & ~field) | ((BigInt(bits) << BigInt(offset)) & field));
};
const insertI = (e: number, bits: number, offset: number, count: number) =>
  i32(BigInt(insertU(e >>> 0, bits >>> 0, offset, count)));

describe('bit counting builtins on a real device', () => {
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
    U32_MAX,
  ] as const;
  const signed = [0, 1, -1, -2, 255, -256, 0x7fffffff, I32_MIN, 123_456, -123_456] as const;

  gpuIt('countLeadingZeros on u32', async ({ root }) => {
    const result = await mapOnGpu(root, d.u32, d.u32, [...unsigned], (x) => {
      'use gpu';
      return std.countLeadingZeros(x);
    });
    expect(result).toStrictEqual(unsigned.map(clz));
  });

  gpuIt('countLeadingZeros on i32', async ({ root }) => {
    const result = await mapOnGpu(root, d.i32, d.i32, [...signed], (x) => {
      'use gpu';
      return std.countLeadingZeros(x);
    });
    expect(result).toStrictEqual(signed.map(clz));
  });

  gpuIt('countLeadingZeros applies per component on vec3u', async ({ root }) => {
    const input = [d.vec3u(0, 1, 2), d.vec3u(U32_MAX, 0x80000000, 255)];
    const result = await mapOnGpu(root, d.vec3u, d.vec3u, input, (x) => {
      'use gpu';
      return std.countLeadingZeros(x);
    });
    expect(result).toStrictEqual([d.vec3u(32, 31, 30), d.vec3u(0, 0, 24)]);
  });

  gpuIt('countTrailingZeros on u32', async ({ root }) => {
    const result = await mapOnGpu(root, d.u32, d.u32, [...unsigned], (x) => {
      'use gpu';
      return std.countTrailingZeros(x);
    });
    expect(result).toStrictEqual(unsigned.map(ctz));
  });

  gpuIt('countTrailingZeros on i32', async ({ root }) => {
    const result = await mapOnGpu(root, d.i32, d.i32, [...signed], (x) => {
      'use gpu';
      return std.countTrailingZeros(x);
    });
    expect(result).toStrictEqual(signed.map(ctz));
  });

  gpuIt(
    'firstLeadingBit on u32 returns the index of the highest set bit, all ones for 0',
    async ({ root }) => {
      const result = await mapOnGpu(root, d.u32, d.u32, [...unsigned], (x) => {
        'use gpu';
        return std.firstLeadingBit(x);
      });
      expect(result).toStrictEqual(unsigned.map(firstLeadingBitU));
    },
  );

  gpuIt(
    'firstLeadingBit on i32 looks for the highest bit that differs from the sign',
    async ({ root }) => {
      const result = await mapOnGpu(root, d.i32, d.i32, [...signed], (x) => {
        'use gpu';
        return std.firstLeadingBit(x);
      });
      expect(result).toStrictEqual(signed.map(firstLeadingBitI));
    },
  );
});

describe('extractBits and insertBits on a real device', () => {
  const Args = d.struct({ e: d.u32, offset: d.u32, count: d.u32 });
  const ArgsI = d.struct({ e: d.i32, offset: d.u32, count: d.u32 });

  // offset + count never exceeds 32, the range in which the result is fully specified
  const extractCases = [
    [0xdeadbeef, 0, 32],
    [0xdeadbeef, 4, 8],
    [U32_MAX, 28, 4],
    [0x12345678, 0, 0],
    [0x80000000, 31, 1],
    [0x000000f0, 4, 4],
    [0x12345678, 8, 8],
    [0xdeadbeef, 16, 16],
  ] as const;

  gpuIt('extractBits on u32 zero-extends the field', async ({ root }) => {
    const input = extractCases.map(([e, offset, count]) => ({ e, offset, count }));
    const result = await mapOnGpu(root, Args, d.u32, input, (a) => {
      'use gpu';
      return std.extractBits(a.e, a.offset, a.count);
    });
    expect(result).toStrictEqual(extractCases.map(([e, o, c]) => extractU(e, o, c)));
  });

  gpuIt('extractBits on i32 sign-extends the field', async ({ root }) => {
    const signedCases = [
      ...extractCases.map(([e, o, c]) => [e | 0, o, c] as const),
      [-1, 0, 8],
    ] as const;
    const input = signedCases.map(([e, offset, count]) => ({ e, offset, count }));
    const result = await mapOnGpu(root, ArgsI, d.i32, input, (a) => {
      'use gpu';
      return std.extractBits(a.e, a.offset, a.count);
    });
    expect(result).toStrictEqual(signedCases.map(([e, o, c]) => extractI(e, o, c)));
  });

  const InsertArgs = d.struct({ e: d.u32, bits: d.u32, offset: d.u32, count: d.u32 });
  const InsertArgsI = d.struct({ e: d.i32, bits: d.i32, offset: d.u32, count: d.u32 });
  const insertCases = [
    [0, U32_MAX, 4, 8],
    [U32_MAX, 0, 8, 8],
    [0x12345678, 0xabcdef01, 0, 32],
    [0x7fffffff, 1, 31, 1],
    [0xdeadbeef, 0x5, 12, 0],
    [0xdeadbeef, 0x1234, 16, 16],
  ] as const;

  gpuIt('insertBits on u32 replaces only the selected field', async ({ root }) => {
    const input = insertCases.map(([e, bits, offset, count]) => ({ e, bits, offset, count }));
    const result = await mapOnGpu(root, InsertArgs, d.u32, input, (a) => {
      'use gpu';
      return std.insertBits(a.e, a.bits, a.offset, a.count);
    });
    expect(result).toStrictEqual(insertCases.map(([e, b, o, c]) => insertU(e, b, o, c)));
  });

  gpuIt('insertBits on i32 keeps the other bits', async ({ root }) => {
    const signedCases = [
      ...insertCases.map(([e, b, o, c]) => [e | 0, b | 0, o, c] as const),
      [-1, 0, 4, 8],
    ] as const;
    const input = signedCases.map(([e, bits, offset, count]) => ({ e, bits, offset, count }));
    const result = await mapOnGpu(root, InsertArgsI, d.i32, input, (a) => {
      'use gpu';
      return std.insertBits(a.e, a.bits, a.offset, a.count);
    });
    expect(result).toStrictEqual(signedCases.map(([e, b, o, c]) => insertI(e, b, o, c)));
  });
});

describe('dot4U8Packed on a real device', () => {
  const Pair = d.struct({ a: d.u32, b: d.u32 });
  const reference = (a: number, b: number) =>
    [0, 8, 16, 24].reduce((sum, shift) => sum + ((a >>> shift) & 0xff) * ((b >>> shift) & 0xff), 0);

  gpuIt('multiplies the four unsigned bytes pairwise and sums them', async ({ root }) => {
    const cases = [
      [0x01020304, 0x05060708],
      [U32_MAX, U32_MAX],
      [0, 0x12345678],
      [0xff000000, 0x80000000],
      [0x00ff00ff, 0x01010101],
    ] as const;
    const result = await mapOnGpu(
      root,
      Pair,
      d.u32,
      cases.map(([a, b]) => ({ a, b })),
      (p) => {
        'use gpu';
        return std.dot4U8Packed(p.a, p.b);
      },
    );
    expect(result).toStrictEqual(cases.map(([a, b]) => reference(a, b)));
  });
});

describe('trunc on a real device', () => {
  // the sign of a zero result is left unchecked: it is not part of what trunc guarantees here
  const noNegativeZero = (values: number[]) => values.map((v) => (v === 0 ? 0 : v));
  const inputs = [0.5, -0.5, 1.5, -1.5, 2.9999998, -2.9999998, 1e10, -1e10, 8388607.5, 3, -3, 0];

  gpuIt('rounds f32 toward zero', async ({ root }) => {
    const result = await mapOnGpu(root, d.f32, d.f32, inputs, (x) => {
      'use gpu';
      return std.trunc(x);
    });
    expect(noNegativeZero(result)).toStrictEqual(
      noNegativeZero(inputs.map((x) => Math.trunc(Math.fround(x)))),
    );
  });

  gpuIt('rounds each component of vec3f toward zero', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.vec3f,
      d.vec3f,
      [d.vec3f(1.5, -1.5, 2.25), d.vec3f(-7.75, 5.75, -10.9)],
      (v) => {
        'use gpu';
        return std.trunc(v);
      },
    );
    expect(result).toStrictEqual([d.vec3f(1, -1, 2), d.vec3f(-7, 5, -10)]);
  });
});

describe('faceForward on a real device', () => {
  const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] as number), 0);
  const pick = (e1: number[], e2: number[], e3: number[]) =>
    dot(e2, e3) < 0 ? e1 : e1.map((v) => -v);

  const Args3 = d.struct({ e1: d.vec3f, e2: d.vec3f, e3: d.vec3f });
  const cases3: [number[], number[], number[]][] = [
    [
      [1, 2, 3],
      [0, 0, 1],
      [0, 0, -1],
    ], // dot < 0: e1
    [
      [1, 2, 3],
      [0, 0, 1],
      [0, 0, 1],
    ], // dot > 0: -e1
    [
      [1, 2, 3],
      [1, 0, 0],
      [0, 1, 0],
    ], // dot == 0: -e1
    [
      [-4, 0, 5],
      [2, -2, 2],
      [-1, 1, 0.5],
    ], // dot < 0 with mixed signs
  ];

  gpuIt('returns e1 only when dot(e2, e3) is negative (vec3f)', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      Args3,
      d.vec3f,
      cases3.map(([e1, e2, e3]) => ({
        e1: d.vec3f(...(e1 as [number, number, number])),
        e2: d.vec3f(...(e2 as [number, number, number])),
        e3: d.vec3f(...(e3 as [number, number, number])),
      })),
      (a) => {
        'use gpu';
        return std.faceForward(a.e1, a.e2, a.e3);
      },
    );
    expect(result).toStrictEqual(
      cases3.map(([e1, e2, e3]) => d.vec3f(...(pick(e1, e2, e3) as [number, number, number]))),
    );
  });

  const Args2 = d.struct({ e1: d.vec2f, e2: d.vec2f, e3: d.vec2f });
  gpuIt('returns e1 only when dot(e2, e3) is negative (vec2f)', async ({ root }) => {
    const cases: [number[], number[], number[]][] = [
      [
        [1, 2],
        [1, 0],
        [-1, 0],
      ],
      [
        [1, 2],
        [1, 0],
        [1, 0],
      ],
      [
        [1, 2],
        [1, 0],
        [0, 1],
      ],
    ];
    const result = await mapOnGpu(
      root,
      Args2,
      d.vec2f,
      cases.map(([e1, e2, e3]) => ({
        e1: d.vec2f(...(e1 as [number, number])),
        e2: d.vec2f(...(e2 as [number, number])),
        e3: d.vec2f(...(e3 as [number, number])),
      })),
      (a) => {
        'use gpu';
        return std.faceForward(a.e1, a.e2, a.e3);
      },
    );
    expect(result).toStrictEqual(
      cases.map(([e1, e2, e3]) => d.vec2f(...(pick(e1, e2, e3) as [number, number]))),
    );
  });
});

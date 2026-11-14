import { d, std } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import { mapOnGpu, noNegativeZero } from './utils.ts';

// Float and matrix builtins without a CPU implementation. Cases use values that are exact in
// f32, or compare with a tolerance only where the result goes through a square root.

const vec = (v: { x: number; y: number; z?: number }) =>
  v.z === undefined ? [v.x, v.y] : [v.x, v.y, v.z];

describe('determinant on a real device', () => {
  const det = (m: number[][]): number => {
    const first = m[0] as number[];
    if (m.length === 1) {
      return first[0] as number;
    }
    return first.reduce((sum, value, column) => {
      const minor = m.slice(1).map((row) => row.filter((_, c) => c !== column));
      return sum + (column % 2 === 0 ? 1 : -1) * value * det(minor);
    }, 0);
  };

  const m2 = [
    [
      [1, 2],
      [3, 4],
    ],
    [
      [2, 0],
      [0, 3],
    ],
    [
      [1, 2],
      [2, 4],
    ],
    [
      [3, 1],
      [4, 2],
    ],
    [
      [3, 4],
      [1, 2],
    ], // rows of the first case swapped
  ];
  const m3 = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [2, 0, 1],
      [1, 3, 2],
      [1, 1, 1],
    ],
    [
      [1, 1, 1],
      [1, 3, 2],
      [2, 0, 1],
    ], // rows of the previous case reordered
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
    [
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
    ],
  ];
  const m4 = [
    [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    [
      [2, 0, 0, 0],
      [0, 3, 0, 0],
      [0, 0, 4, 0],
      [0, 0, 0, 5],
    ],
    [
      [1, 2, 0, 1],
      [0, 1, 3, 2],
      [2, 0, 1, 1],
      [1, 1, 1, 0],
    ],
    [
      [0, 1, 3, 2],
      [1, 2, 0, 1],
      [2, 0, 1, 1],
      [1, 1, 1, 0],
    ], // two rows of the previous case swapped
    [
      [1, 2, 3, 4],
      [2, 4, 6, 8],
      [0, 1, 0, 1],
      [1, 0, 1, 0],
    ],
  ];
  // the determinant does not change under transposition, so the column-major layout is irrelevant
  const flat = (m: number[][]) => m.flat();

  gpuIt('mat2x2f', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.mat2x2f,
      d.f32,
      m2.map((m) => d.mat2x2f(...(flat(m) as [number, number, number, number]))),
      (m) => {
        'use gpu';
        return std.determinant(m);
      },
    );
    expect(noNegativeZero(result)).toStrictEqual(noNegativeZero(m2.map(det)));
  });

  gpuIt('mat3x3f', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.mat3x3f,
      d.f32,
      m3.map((m) => d.mat3x3f(...(flat(m) as Parameters<typeof d.mat3x3f>))),
      (m) => {
        'use gpu';
        return std.determinant(m);
      },
    );
    expect(noNegativeZero(result)).toStrictEqual(noNegativeZero(m3.map(det)));
  });

  gpuIt('mat4x4f', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.mat4x4f,
      d.f32,
      m4.map((m) => d.mat4x4f(...(flat(m) as Parameters<typeof d.mat4x4f>))),
      (m) => {
        'use gpu';
        return std.determinant(m);
      },
    );
    expect(noNegativeZero(result)).toStrictEqual(noNegativeZero(m4.map(det)));
  });
});

describe('refract on a real device', () => {
  const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] as number), 0);
  const reference = (e1: number[], e2: number[], eta: number) => {
    const incidence = dot(e2, e1);
    const k = 1 - eta * eta * (1 - incidence * incidence);
    return k < 0
      ? e1.map(() => 0)
      : e1.map((v, i) => eta * v - (eta * incidence + Math.sqrt(k)) * (e2[i] as number));
  };

  const Args3 = d.struct({ e1: d.vec3f, e2: d.vec3f, eta: d.f32 });
  const cases3: [number[], number[], number][] = [
    [[0.6, -0.8, 0], [0, 1, 0], 1], // eta 1: the ray goes straight through
    [[0.6, -0.8, 0], [0, 1, 0], 0.75],
    [[0.6, -0.8, 0], [0, 1, 0], 0.5],
    [[0, -1, 0], [0, 1, 0], 0.5], // normal incidence: direction is kept
    [[0.8, -0.6, 0], [0, 1, 0], 1.5], // grazing, eta > 1: total internal reflection
    [[0, -0.6, 0.8], [0, 1, 0], 2], // total internal reflection, other axes
  ];

  gpuIt(
    'vec3f matches the formula and returns the zero vector on total internal reflection',
    async ({ root }) => {
      const result = await mapOnGpu(
        root,
        Args3,
        d.vec3f,
        cases3.map(([e1, e2, eta]) => ({
          e1: d.vec3f(...(e1 as [number, number, number])),
          e2: d.vec3f(...(e2 as [number, number, number])),
          eta,
        })),
        (a) => {
          'use gpu';
          return std.refract(a.e1, a.e2, a.eta);
        },
      );
      cases3.forEach(([e1, e2, eta], index) => {
        const expected = reference(e1, e2, eta);
        const actual = vec(result[index] as { x: number; y: number; z: number });
        if (expected.every((v) => v === 0)) {
          expect(
            actual.map((v) => v + 0),
            `case ${index} must be exactly zero`,
          ).toStrictEqual([0, 0, 0]);
        } else {
          actual.forEach((v, c) =>
            expect(v, `case ${index} component ${c}`).toBeCloseTo(expected[c] as number, 5),
          );
        }
      });
    },
  );

  const Args2 = d.struct({ e1: d.vec2f, e2: d.vec2f, eta: d.f32 });
  gpuIt('vec2f', async ({ root }) => {
    const cases: [number[], number[], number][] = [
      [[0.6, -0.8], [0, 1], 0.75],
      [[0.8, -0.6], [0, 1], 1.5], // total internal reflection
    ];
    const result = await mapOnGpu(
      root,
      Args2,
      d.vec2f,
      cases.map(([e1, e2, eta]) => ({
        e1: d.vec2f(...(e1 as [number, number])),
        e2: d.vec2f(...(e2 as [number, number])),
        eta,
      })),
      (a) => {
        'use gpu';
        return std.refract(a.e1, a.e2, a.eta);
      },
    );
    cases.forEach(([e1, e2, eta], index) => {
      const expected = reference(e1, e2, eta);
      vec(result[index] as { x: number; y: number }).forEach((v, c) =>
        expect(v, `case ${index} component ${c}`).toBeCloseTo(expected[c] as number, 5),
      );
    });
  });
});

describe('ldexp on a real device', () => {
  const Args = d.struct({ x: d.f32, e: d.i32 });
  const cases = [
    [1.5, 3],
    [0.75, -2],
    [-1, 10],
    [1, -1],
    [3, 0],
    [0.1, 4],
    [-6.5, -3],
  ] as const;

  gpuIt('f32 scales by a power of two exactly', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      Args,
      d.f32,
      cases.map(([x, e]) => ({ x, e })),
      (a) => {
        'use gpu';
        return std.ldexp(a.x, a.e);
      },
    );
    expect(result).toStrictEqual(cases.map(([x, e]) => Math.fround(x) * 2 ** e));
  });

  const VecArgs = d.struct({ x: d.vec3f, e: d.vec3i });
  gpuIt('vec3f applies a separate exponent per component', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      VecArgs,
      d.vec3f,
      [{ x: d.vec3f(1, 2, 3), e: d.vec3i(1, -1, 2) }],
      (a) => {
        'use gpu';
        return std.ldexp(a.x, a.e);
      },
    );
    expect(result).toStrictEqual([d.vec3f(2, 1, 12)]);
  });
});

describe('frexp on a real device', () => {
  const FrexpOut = d.struct({ fract: d.f32, exp: d.i32 });
  const reference = (input: number) => {
    const x = Math.fround(input);
    if (x === 0) {
      return { fract: 0, exp: 0 };
    }
    let exp = Math.floor(Math.log2(Math.abs(x))) + 1;
    let fract = x * 2 ** -exp;
    if (Math.abs(fract) >= 1) {
      exp += 1;
      fract /= 2;
    } else if (Math.abs(fract) < 0.5) {
      exp -= 1;
      fract *= 2;
    }
    return { fract, exp };
  };
  const inputs = [1, 2, 0.5, 3, -3, 10, 0.1, 1e10, 6.5, -8, 1e-3, 0];

  gpuIt('f32 splits into a fraction in [0.5, 1) and an exponent', async ({ root }) => {
    const result = await mapOnGpu(root, d.f32, FrexpOut, inputs, (x) => {
      'use gpu';
      const r = std.frexp(x);
      return FrexpOut({ fract: r.fract, exp: r.exp });
    });
    expect(result.map((r) => ({ fract: noNegativeZero([r.fract])[0], exp: r.exp }))).toStrictEqual(
      inputs.map((x) => {
        const expected = reference(x);
        return { fract: noNegativeZero([expected.fract])[0], exp: expected.exp };
      }),
    );
    // and it recombines to the input
    result.forEach((r, i) => expect(r.fract * 2 ** r.exp).toBe(Math.fround(inputs[i] as number)));
  });

  const FrexpOut3 = d.struct({ fract: d.vec3f, exp: d.vec3i });
  gpuIt('vec3f applies per component', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.vec3f,
      FrexpOut3,
      [d.vec3f(1, 2, 3), d.vec3f(-4, 0.25, 100)],
      (x) => {
        'use gpu';
        const r = std.frexp(x);
        return FrexpOut3({ fract: r.fract, exp: r.exp });
      },
    );
    expect(result).toStrictEqual([
      { fract: d.vec3f(0.5, 0.5, 0.75), exp: d.vec3i(1, 2, 2) },
      { fract: d.vec3f(-0.5, 0.5, 0.78125), exp: d.vec3i(3, -1, 7) },
    ]);
  });
});

describe('modf on a real device', () => {
  const ModfOut = d.struct({ fract: d.f32, whole: d.f32 });
  const inputs = [1.5, -1.5, 3, 0.25, -0.75, 1e10, 123_456.75, 0, -2.5];

  gpuIt('f32 splits into fraction and whole part with the sign of the input', async ({ root }) => {
    const result = await mapOnGpu(root, d.f32, ModfOut, inputs, (x) => {
      'use gpu';
      const r = std.modf(x);
      return ModfOut({ fract: r.fract, whole: r.whole });
    });
    const expected = inputs.map((input) => {
      const x = Math.fround(input);
      return { fract: x - Math.trunc(x), whole: Math.trunc(x) };
    });
    expect(
      result.map((r) => ({
        fract: noNegativeZero([r.fract])[0],
        whole: noNegativeZero([r.whole])[0],
      })),
    ).toStrictEqual(
      expected.map((r) => ({
        fract: noNegativeZero([r.fract])[0],
        whole: noNegativeZero([r.whole])[0],
      })),
    );
  });

  const ModfOut2 = d.struct({ fract: d.vec2f, whole: d.vec2f });
  gpuIt('vec2f applies per component', async ({ root }) => {
    const result = await mapOnGpu(
      root,
      d.vec2f,
      ModfOut2,
      [d.vec2f(1.5, -2.25), d.vec2f(-7.75, 5.5)],
      (x) => {
        'use gpu';
        const r = std.modf(x);
        return ModfOut2({ fract: r.fract, whole: r.whole });
      },
    );
    expect(result).toStrictEqual([
      { fract: d.vec2f(0.5, -0.25), whole: d.vec2f(1, -2) },
      { fract: d.vec2f(-0.75, 0.5), whole: d.vec2f(-7, 5) },
    ]);
  });
});

describe('quantizeToF16 on a real device', () => {
  // The rounding direction for values between two f16 numbers is not what is tested; the
  // result has to be one of the two neighbouring f16 values, and exact for representable input.
  const neighbours = (x: number): [number, number] => {
    if (x === 0) {
      return [0, 0];
    }
    const spacing = 2 ** (Math.floor(Math.log2(Math.abs(x))) - 10);
    return [Math.floor(x / spacing) * spacing, Math.ceil(x / spacing) * spacing];
  };
  const inputs = [
    0,
    1,
    -1,
    0.5,
    65504,
    -65504,
    0.1,
    1 / 3,
    Math.PI,
    1000.1,
    6.2e-5,
    1.0009765625,
    1.0004,
    2049,
    -0.3333,
    12345.678,
  ];

  gpuIt(
    'rounds f32 to a neighbouring f16 value and keeps f16 values unchanged',
    async ({ root }) => {
      const result = await mapOnGpu(root, d.f32, d.f32, inputs, (x) => {
        'use gpu';
        return std.quantizeToF16(x);
      });
      inputs.forEach((input, i) => {
        const x = Math.fround(input);
        const [lower, upper] = neighbours(x);
        expect([lower, upper], `input ${input}`).toContain(result[i]);
        expect(Math.f16round(result[i] as number), `result for ${input} must be an f16 value`).toBe(
          result[i],
        );
      });
    },
  );

  gpuIt('applies per component on vec3f', async ({ root }) => {
    const input = d.vec3f(0.1, 1 / 3, 1000.1);
    const [result] = await mapOnGpu(root, d.vec3f, d.vec3f, [input], (x) => {
      'use gpu';
      return std.quantizeToF16(x);
    });
    [result?.x, result?.y, result?.z].forEach((v, i) => {
      const x = Math.fround([input.x, input.y, input.z][i] as number);
      expect(neighbours(x)).toContain(v);
    });
  });
});

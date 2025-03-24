import { JitTranspiler } from 'tgpu-jit';
import type * as smol from 'tinyest';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { StrictNameRegistry } from '../../src';
import tgpu from '../../src';
import { getPrebuiltAstFor } from '../../src/core/function/astUtils';
import * as d from '../../src/data';
import { abstractFloat, abstractInt } from '../../src/data/numeric';
import * as gpu from '../../src/gpuMode';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';
import { $internal } from '../../src/shared/symbols';
import * as wgslGenerator from '../../src/smol/wgslGenerator';
import * as std from '../../src/std';
import { Void } from '../../src/types';
import { it } from '../utils/extendedIt';
import { parse } from '../utils/parseResolved';
import { parseResolved } from '../utils/parseResolved';

const transpiler = new JitTranspiler();

const createContext = () => {
  return new ResolutionCtxImpl({
    names: new StrictNameRegistry(),
    jitTranspiler: transpiler,
  });
};

describe('wgslGenerator', () => {
  let ctx: ResolutionCtxImpl;

  beforeEach(() => {
    gpu.pushMode(gpu.RuntimeMode.GPU);
    ctx = createContext();
    vi.spyOn(gpu, 'getResolutionCtx').mockReturnValue(ctx);
  });

  afterEach(() => {
    gpu.popMode(gpu.RuntimeMode.GPU);
  });

  it('creates a simple return statement', () => {
    const code = `
      function main() {
        return true;
      }
    `;

    const parsedBody = transpiler.transpileFn(code).body;

    expect(parsedBody).toEqual({
      b: [
        {
          r: true,
        },
      ],
    });

    const gen = wgslGenerator.generateFunction(ctx, parsedBody);

    expect(parse(gen)).toEqual(parse('{return true;}'));
  });

  it('creates a function body', () => {
    const code = `
      function main() {
        let a = 12;
        a += 21;
        return a;
      }
    `;

    const parsedBody = transpiler.transpileFn(code).body;

    // biome-ignore format: <it's better that way>
    expect(parsedBody).toEqual({ b: [{ l: ['a', { n: '12', },], }, { x: ['a', '+=', { n: '21', },], }, { r: 'a', },], });

    const gen = wgslGenerator.generateFunction(ctx, parsedBody);

    expect(parse(gen)).toEqual(parse('{var a = 12;a += 21;return a;}'));
  });

  it('creates correct resources for numeric literals', () => {
    const literals = {
      intLiteral: { value: '12', wgsl: '12', dataType: abstractInt },
      floatLiteral: { value: '12.5', wgsl: '12.5', dataType: abstractFloat },
      weirdFloatLiteral: {
        value: '.32',
        wgsl: '.32',
        dataType: abstractFloat,
      },
      sneakyFloatLiteral: {
        value: '32.',
        wgsl: '32.',
        dataType: abstractFloat,
      },
      scientificLiteral: {
        value: '1.2e3',
        wgsl: '1.2e3',
        dataType: abstractFloat,
      },
      scientificNegativeExponentLiteral: {
        value: '1.2e-3',
        wgsl: '1.2e-3',
        dataType: abstractFloat,
      },
      hexLiteral: { value: '0x12', wgsl: '0x12', dataType: abstractInt },
      // Since binary literals are not supported in WGSL, they are converted to decimal.
      binLiteral: { value: '0b1010', wgsl: '10', dataType: abstractInt },
    } as const;

    const code = `{
        ${Object.entries(literals)
          .map(([key, { value }]) => `let ${key} = ${value};`)
          .join('\n')}
      }`;

    const parsedBody = transpiler.transpile(code);

    expect(parsedBody).toEqual({
      b: Object.entries(literals).map(([key, { value }]) => ({
        l: [key, { n: value }],
      })),
    });

    for (const stmt of (parsedBody as smol.Block).b) {
      const letStatement = stmt as smol.Let;
      const [name, numLiteral] = letStatement.l;
      const generatedExpr = wgslGenerator.generateExpression(
        ctx,
        numLiteral as smol.Num,
      );
      const expected = literals[name as keyof typeof literals];

      expect(generatedExpr.dataType).toEqual(expected.dataType);
    }
  });

  it('generates correct resources for member access expressions', ({
    root,
  }) => {
    const testBuffer = root
      .createBuffer(
        d
          .struct({
            a: d.u32,
            b: d.vec2u,
          })
          .$name('TestStruct'),
      )
      .$usage('storage')
      .$name('testBuffer');

    const testUsage = testBuffer.as('mutable');

    const testFn = tgpu['~unstable']
      .fn([], d.u32)
      .does(() => {
        return testUsage.value.a + testUsage.value.b.x;
      })
      .$name('testFn');

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );
    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ r: { x: [{ a: [{ a: ['testUsage', 'value'], }, 'a',], }, '+', { a: [{ a: [{ a: ['testUsage', 'value'], }, 'b',], }, 'x',], },], }, },], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);
    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                      ^ this should be a u32
    const res1 = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0].r
        .x[0] as smol.Expression,
    );

    expect(res1.dataType).toEqual(d.u32);

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                                            ^ this should be a u32
    const res2 = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0].r
        .x[2] as smol.Expression,
    );
    expect(res2.dataType).toEqual(d.u32);

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //              ^ this should be a u32
    const sum = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .r as smol.Expression,
    );
    expect(sum.dataType).toEqual(d.u32);
  });

  it('generates correct resources for external resource array index access', ({
    root,
  }) => {
    const testBuffer = root
      .createBuffer(d.arrayOf(d.u32, 16))
      .$usage('uniform')
      .$name('testBuffer');

    const testUsage = testBuffer.as('uniform');

    const testFn = tgpu['~unstable'].fn([], d.u32).does(() => {
      return testUsage.value[3] as number;
    });

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ r: { i: [{ a: ['testUsage', 'value'], }, { n: '3', },], }, },], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: return testUsage.value[3];
    //              ^ this should be a u32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .r as smol.Expression,
    );

    expect(res.dataType).toEqual(d.u32);
  });

  it('generates correct resources for nested struct with atomics in a complex expression', ({
    root,
  }) => {
    const testBuffer = root
      .createBuffer(
        d
          .struct({
            a: d.vec4f,
            b: d
              .struct({
                aa: d.arrayOf(
                  d
                    .struct({ x: d.atomic(d.u32), y: d.atomic(d.i32) })
                    .$name('DeeplyNestedStruct'),
                  64,
                ),
              })
              .$name('NestedStruct'),
          })
          .$name('TestStruct'),
      )
      .$usage('storage')
      .$name('testBuffer');

    const testUsage = testBuffer.as('mutable');

    const testFn = tgpu['~unstable']
      .fn([d.u32], d.vec4f)
      .does((idx) => {
        // biome-ignore lint/style/noNonNullAssertion: <no thanks>
        const value = std.atomicLoad(testUsage.value.b.aa[idx]!.y);
        const vec = std.mix(d.vec4f(), testUsage.value.a, value);
        // biome-ignore lint/style/noNonNullAssertion: <no thanks>
        std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
        return vec;
      })
      .$name('testFn');

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // One AST to rule them all ৻(•̀ ᗜ •́৻)
    const expectedAst = {
      b: [
        // biome-ignore format: <good luck with this formatted>
        { c: ['value', { f: [{ a: ['std', 'atomicLoad'] }, [{ a: [{ i: [{ a: [{ a: [{ a: ['testUsage', 'value'] }, 'b'] }, 'aa'] }, 'idx'] }, 'y'] }]] }] },
        // biome-ignore format: <good luck with this formatted>
        { c: ['vec', { f: [{ a: ['std', 'mix'] }, [{ f: [{ a: ['d', 'vec4f'] }, []] }, { a: [{ a: ['testUsage', 'value'] }, 'a'] }, 'value']] }] },
        // biome-ignore format: <good luck with this formatted>
        { f: [{ a: ['std', 'atomicStore'] }, [{ a: [{ i: [{ a: [{ a: [{ a: ['testUsage', 'value'] }, 'b'] }, 'aa'] }, 'idx'] }, 'x'] }, { a: ['vec', 'y'] }]] },
        { r: 'vec' },
      ],
    } as const;
    expect(astInfo.ast.body).toEqual(expectedAst);

    const args = astInfo.ast.argNames.map((name) => ({
      value: name,
      dataType: d.u32,
    }));

    ctx[$internal].itemStateStack.pushFunctionScope(
      args,
      d.vec4f,
      astInfo.externals ?? {},
    );

    // Check for: const value = std.atomicLoad(testUsage.value.b.aa[idx]!.y);
    //                           ^ this part should be a i32
    const res = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore lint/style/noNonNullAssertion: <it's there>
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]!
        .c![1] as unknown as smol.Expression,
    );

    expect(res.dataType).toEqual(d.i32);

    // Check for: const vec = std.mix(d.vec4f(), testUsage.value.a, value);
    //                        ^ this part should be a vec4f
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'value', d.i32);
    const res2 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore lint/style/noNonNullAssertion: <it's there>
      (astInfo.ast.body as unknown as typeof expectedAst).b[1]!
        .c![1] as unknown as smol.Expression,
    );
    ctx[$internal].itemStateStack.popBlockScope();

    expect(res2.dataType).toEqual(d.vec4f);

    // Check for: std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
    //                             ^ this part should be an atomic u32
    //                  ^ this part should be void
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'vec', d.vec4f);
    const res3 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore lint/style/noNonNullAssertion: <it's there>
      (astInfo.ast.body as unknown as typeof expectedAst).b[2]!
        .f![1][0] as unknown as smol.Expression,
    );
    const res4 = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst)
        .b[2] as unknown as smol.Expression,
    );
    ctx[$internal].itemStateStack.popBlockScope();

    expect(res3.dataType).toEqual(d.atomic(d.u32));
    expect(res4.dataType).toEqual(Void);
  });

  it('creates correct code for for statements', () => {
    const code = `
      function main() {
        for (let i = 0; i < 10; i += 1) {
          continue;
        }
      }
    `;

    const parsed = transpiler.transpileFn(code).body;

    expect(parsed).toEqual({
      b: [
        {
          j: [
            {
              l: ['i', { n: '0' }],
            },
            {
              x: ['i', '<', { n: '10' }],
            },
            {
              x: ['i', '+=', { n: '1' }],
            },
            {
              b: [
                {
                  k: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toEqual(
      parse('{for(var i = 0;(i < 10);i += 1){continue;}}'),
    );
  });

  it('creates correct code for for statements with outside init', () => {
    const code = `
      function main() {
        let i = 0;
        for (; i < 10; i += 1) {
          continue;
        }
      }
    `;

    const parsed = transpiler.transpileFn(code).body;

    expect(parsed).toEqual({
      b: [
        {
          l: ['i', { n: '0' }],
        },
        {
          j: [
            undefined,
            {
              x: ['i', '<', { n: '10' }],
            },
            {
              x: ['i', '+=', { n: '1' }],
            },
            {
              b: [
                {
                  k: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toEqual(
      parse('{var i = 0;for(;(i < 10);i += 1){continue;}}'),
    );
  });

  it('creates correct code for while statements', () => {
    const code = `
      function main() {
        let i = 0;
        while (i < 10) {
          i += 1;
        }
      }
    `;

    const parsed = transpiler.transpileFn(code).body;

    expect(parsed).toEqual({
      b: [
        {
          l: ['i', { n: '0' }],
        },
        {
          w: [
            {
              x: ['i', '<', { n: '10' }],
            },
            {
              b: [
                {
                  x: ['i', '+=', { n: '1' }],
                },
              ],
            },
          ],
        },
      ],
    });

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toEqual(parse('{var i = 0;while((i < 10)){i += 1;}}'));
  });

  it('creates correct resources for derived values and slots', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.u32(numberSlot.value), d.vec4u(1, 2, 3, 4)),
    );

    const testFn = tgpu['~unstable']
      .fn([], d.vec4u)
      .does(() => {
        return derived.value;
      })
      .$name('testFn');

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() -> vec4u {
        return vec4u(44, 88, 132, 176);
      }`),
    );

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ r: { a: ['derived', 'value'], }, },], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.vec4u,
      astInfo.externals ?? {},
    );

    // Check for: return derived.value;
    //                      ^ this should be a vec4u
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .r as smol.Expression,
    );

    expect(res.dataType).toEqual(d.vec4u);
  });

  it('creates correct resources for indexing into a derived value', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.f32(numberSlot.value), d.vec2f(1, 2)),
    );

    const testFn = tgpu['~unstable']
      .fn([d.u32], d.f32)
      .does((idx) => {
        return derived.value[idx] as number;
      })
      .$name('testFn');

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ r: { i: [{ a: ['derived', 'value'], }, 'idx'] }, },], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [{ value: 'idx', dataType: d.u32 }],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return derived.value[idx];
    //                      ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .r as smol.Expression,
    );

    expect(res.dataType).toEqual(d.f32);
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu['~unstable'].fn([], d.u32).does(() => {
      const arr = [1, 2, 3];
      return arr[1] as number;
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() -> u32 {
        var arr = array<u32, 3>(1, 2, 3);
        return arr[1];
      }`),
    );

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ c: ['arr', { 'y': [{ n: '1' }, { n: '2' }, { n: '3' }] },] }, { r: { i: ['arr', { n: '1' }] }, },], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: var arr = array<u32, 3>(1, 2, 3);
    //             ^ this should be an array<u32, 3>
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .c[1] as unknown as smol.Expression,
    );

    expect(res.dataType).toEqual(d.arrayOf(d.u32, 3));
  });

  it('generates correct code for array expressions with struct elements', () => {
    const testStruct = d
      .struct({
        x: d.u32,
        y: d.f32,
      })
      .$name('TestStruct');

    const testFn = tgpu['~unstable'].fn([], d.f32).does(() => {
      const arr = [testStruct({ x: 1, y: 2 }), testStruct({ x: 3, y: 4 })];
      return (arr[1] as { x: number; y: number }).y;
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      struct TestStruct {
        x: u32,
        y: f32,
      }

      fn testFn() -> f32 {
        var arr = array<TestStruct, 2>(TestStruct(1, 2), TestStruct(3, 4));
        return arr[1].y;
      }`),
    );

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    // biome-ignore format: <it's better that way>
    const expectedAst = { b: [{ c: ['arr', { y: [{ f: ['testStruct', [{ o: { x: { n: '1', }, y: { n: '2', }, }, },], ], }, { f: ['testStruct', [{ o: { x: { n: '3', }, y: { n: '4', }, }, },], ], },], }, ], }, { r: { a: [{ i: ['arr', { n: '1', }, ], }, 'y', ], }, }, ], } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: var arr = array<TestStruct, 2>(TestStruct(1, 2), TestStruct(3, 4));
    //            ^ this should be an array<TestStruct, 2>
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .c[1] as unknown as smol.Expression,
    );

    expect(res.dataType).toEqual(d.arrayOf(testStruct, 2));
  });

  it('generates correct code for array expressions with derived elements', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.f32(numberSlot.value), d.vec2f(1, 2)),
    );

    const testFn = tgpu['~unstable']
      .fn([], d.f32)
      .does(() => {
        const arr = [derived.value, std.mul(derived.value, d.vec2f(2, 2))];
        return (arr[1] as { x: number; y: number }).y;
      })
      .$name('testFn');

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() -> f32 {
        var arr = array<vec2f, 2>(vec2f(44, 88), (vec2f(44, 88) * vec2f(2, 2)));
        return arr[1].y;
      }`),
    );

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(astInfo.ast.body).toMatchInlineSnapshot(`
      {
        "b": [
          {
            "c": [
              "arr",
              {
                "y": [
                  {
                    "a": [
                      "derived",
                      "value",
                    ],
                  },
                  {
                    "f": [
                      {
                        "a": [
                          "std",
                          "mul",
                        ],
                      },
                      [
                        {
                          "a": [
                            "derived",
                            "value",
                          ],
                        },
                        {
                          "f": [
                            {
                              "a": [
                                "d",
                                "vec2f",
                              ],
                            },
                            [
                              {
                                "n": "2",
                              },
                              {
                                "n": "2",
                              },
                            ],
                          ],
                        },
                      ],
                    ],
                  },
                ],
              },
            ],
          },
          {
            "r": {
              "a": [
                {
                  "i": [
                    "arr",
                    {
                      "n": "1",
                    },
                  ],
                },
                "y",
              ],
            },
          },
        ],
      }
    `);
  });

  it('allows for member access on values returned from function calls', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.vec3f,
    });

    const fnOne = tgpu['~unstable'].fn([], TestStruct).does(() => {
      return TestStruct({ x: 1, y: d.vec3f(1, 2, 3) });
    });

    const fnTwo = tgpu['~unstable'].fn([], d.f32).does(() => {
      return fnOne().y.x;
    });

    expect(parseResolved({ fnTwo })).toEqual(
      parse(`
      struct TestStruct {
        x: u32,
        y: vec3f,
      }

      fn fnOne() -> TestStruct {
        return TestStruct(1, vec3f(1, 2, 3));
      }

      fn fnTwo() -> f32 {
        return fnOne().y.x;
      }`),
    );

    const astInfo = getPrebuiltAstFor(
      fnTwo[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(astInfo.ast.body).toMatchInlineSnapshot(`
      {
        "b": [
          {
            "r": {
              "a": [
                {
                  "a": [
                    {
                      "f": [
                        "fnOne",
                        [],
                      ],
                    },
                    "y",
                  ],
                },
                "x",
              ],
            },
          },
        ],
      }
    `);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return fnOne().y.x;
    //                     ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore lint/suspicious/noExplicitAny: <sue me>
      (astInfo.ast.body as any).b[0].r as smol.Expression,
    );

    expect(res.dataType).toEqual(d.f32);
  });
});

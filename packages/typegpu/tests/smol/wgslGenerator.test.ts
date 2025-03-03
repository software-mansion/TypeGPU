import { JitTranspiler } from 'tgpu-jit';
import { parse } from 'tgpu-wgsl-parser';
import type * as smol from 'tinyest';
import { beforeEach, describe, expect, vi } from 'vitest';
import { StrictNameRegistry, type TgpuFn } from '../../src';
import tgpu from '../../src';
import { getPrebuiltAstFor } from '../../src/core/function/astUtils';
import { functionInternal } from '../../src/core/function/fnCore';
import * as d from '../../src/data';
import { abstractFloat, abstractInt } from '../../src/data/numeric';
import * as gpu from '../../src/gpuMode';
import { ResolutionCtxImpl, contextInternal } from '../../src/resolutionCtx';
import {
  generateExpression,
  generateFunction,
} from '../../src/smol/wgslGenerator';
import { it } from '../utils/extendedIt';

type TestFn = TgpuFn & {
  implementation: () => unknown;
  // biome-ignore lint/suspicious/noExplicitAny: <Too complex>
  [functionInternal]: any;
};

type ExposedContext = ResolutionCtxImpl & {
  // biome-ignore lint/suspicious/noExplicitAny: <Too complex>
  [contextInternal]: any;
};
const transpiler = new JitTranspiler();

const createContext = () => {
  return new ResolutionCtxImpl({
    names: new StrictNameRegistry(),
    jitTranspiler: transpiler,
  });
};

describe('wgslGenerator', () => {
  let ctx: ExposedContext;

  beforeEach(() => {
    vi.spyOn(gpu, 'inGPUMode').mockReturnValue(true);
    ctx = createContext() as ExposedContext;
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

    const gen = generateFunction(ctx, parsedBody);

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

    expect(parsedBody).toEqual({
      b: [
        {
          l: [
            'a',
            {
              n: '12',
            },
          ],
        },
        {
          x: [
            'a',
            '+=',
            {
              n: '21',
            },
          ],
        },
        {
          r: 'a',
        },
      ],
    });

    const gen = generateFunction(ctx, parsedBody);

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
      const generatedExpr = generateExpression(ctx, numLiteral as smol.Num);
      const expected = literals[name as keyof typeof literals];

      expect(generatedExpr.dataType).toEqual(expected.dataType);
    }
  });

  it('generates correct resources for member access expressions', ({
    root,
  }) => {
    const testBuffer = root
      .createBuffer(
        d.struct({
          a: d.u32,
          b: d.vec2f,
        }),
      )
      .$usage('storage');

    const testUsage = testBuffer.as('mutable');

    const testFn = tgpu['~unstable'].fn([], d.u32).does(() => {
      return testUsage.value.a + testUsage.value.b.x;
    }) as unknown as TestFn;

    const astInfo = getPrebuiltAstFor(testFn[functionInternal].implementation);
    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    const expectedAst = {
      b: [
        {
          r: {
            x: [
              {
                a: [
                  {
                    a: ['testUsage', 'value'],
                  },
                  'a',
                ],
              },
              '+',
              {
                a: [
                  {
                    a: [
                      {
                        a: ['testUsage', 'value'],
                      },
                      'b',
                    ],
                  },
                  'x',
                ],
              },
            ],
          },
        },
      ],
    } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);
    ctx[contextInternal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals,
    );

    const res1 = generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0].r
        .x[0] as smol.Expression,
    );

    expect(res1.dataType).toEqual(d.u32);

    const res2 = generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0].r
        .x[2] as smol.Expression,
    );
    expect(res2.dataType).toEqual(d.f32);
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
    }) as unknown as TestFn;

    const astInfo = getPrebuiltAstFor(testFn[functionInternal].implementation);

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    const expectedAst = {
      b: [
        {
          r: {
            i: [
              {
                a: ['testUsage', 'value'],
              },
              {
                n: '3',
              },
            ],
          },
        },
      ],
    } as const;

    expect(astInfo.ast.body).toEqual(expectedAst);

    ctx[contextInternal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals,
    );

    const res = generateExpression(
      ctx,
      (astInfo.ast.body as unknown as typeof expectedAst).b[0]
        .r as smol.Expression,
    );

    expect(res.dataType).toEqual(d.u32);
  });
});

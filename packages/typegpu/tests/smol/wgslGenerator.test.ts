import { JitTranspiler } from 'tgpu-jit';
import { parse } from 'tgpu-wgsl-parser';
import type * as smol from 'tinyest';
import { beforeEach, describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../../src';
import { abstractFloat, abstractInt } from '../../src/data/numeric';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';
import {
  generateExpression,
  generateFunction,
} from '../../src/smol/wgslGenerator';

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
    ctx = createContext();
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

    const gen = generateFunction(ctx, parsed);

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

    const gen = generateFunction(ctx, parsed);

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

    const gen = generateFunction(ctx, parsed);

    expect(parse(gen)).toEqual(parse('{var i = 0;while((i < 10)){i += 1;}}'));
  });
});

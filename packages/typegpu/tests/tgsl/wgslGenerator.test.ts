import * as tinyest from 'tinyest';
import { beforeEach, describe, expect } from 'vitest';
import { namespace } from '../../src/core/resolve/namespace.ts';
import * as d from '../../src/data/index.ts';
import { abstractFloat, abstractInt } from '../../src/data/numeric.ts';
import { snip } from '../../src/data/snippet.ts';
import { Void, type WgslArray } from '../../src/data/wgslTypes.ts';
import { provideCtx } from '../../src/execMode.ts';
import tgpu from '../../src/index.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { getMetaData } from '../../src/shared/meta.ts';
import { $internal } from '../../src/shared/symbols.ts';
import * as std from '../../src/std/index.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { CodegenState } from '../../src/types.ts';
import { it } from '../utils/extendedIt.ts';
import { ArrayExpression } from '../../src/tgsl/generationHelpers.ts';
import { extractSnippetFromFn } from '../utils/parseResolved.ts';

const { NodeTypeCatalog: NODE } = tinyest;

const numberSlot = tgpu.slot(44);
const lazyV4u = tgpu.lazy(() => d.vec4u(1, 2, 3, 4).mul(numberSlot.$));
const lazyV2f = tgpu.lazy(() => d.vec2f(1, 2).mul(numberSlot.$));

describe('wgslGenerator', () => {
  let ctx: ResolutionCtxImpl;
  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      namespace: namespace({ names: 'strict' }),
      shaderGenerator: wgslGenerator,
    });
    ctx.pushMode(new CodegenState());
    wgslGenerator.initGenerator(ctx);
  });

  it('creates a simple return statement', () => {
    const main = () => {
      'use gpu';
      return true;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[0,[[10,true]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.bool,
        {},
      );
      const gen = wgslGenerator.functionDefinition(parsedBody);
      expect(gen).toMatchInlineSnapshot(`
        "{
          return true;
        }"
      `);
    });
  });

  it('creates a function body', () => {
    const main = () => {
      'use gpu';
      let a = 12;
      a += 21;
      return a;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[0,[[12,"a",[5,"12"]],[2,"a","+=",[5,"21"]],[10,"a"]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.i32,
        {},
      );
      const gen = wgslGenerator.functionDefinition(parsedBody);
      expect(gen).toMatchInlineSnapshot(`
        "{
          var a = 12;
          a += 21i;
          return a;
        }"
      `);
    });
  });

  it('creates correct resources for numeric literals', () => {
    const literals = {
      intLiteral: { value: '12', wgsl: '12', dataType: abstractInt },
      floatLiteral: { value: '12.5', wgsl: '12.5', dataType: abstractFloat },
      scientificLiteral: {
        value: '120000000000',
        dataType: abstractInt,
      },
      scientificNegativeExponentLiteral: {
        value: '0.0012',
        dataType: abstractFloat,
      },
    } as const;

    const main = () => {
      'use gpu';
      const intLiteral = 12;
      const floatLiteral = 12.5;
      const scientificLiteral = 12e10;
      const scientificNegativeExponentLiteral = 1.2e-3;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(parsedBody).toStrictEqual([
      NODE.block,
      Object.entries(literals).map(([key, { value }]) => [
        NODE.const,
        key,
        [NODE.numericLiteral, value],
      ]),
    ]);

    provideCtx(ctx, () => {
      for (const stmt of parsedBody[1]) {
        const letStatement = stmt as tinyest.Let;
        const [_, name, numLiteral] = letStatement;
        const generatedExpr = wgslGenerator.expression(
          numLiteral as tinyest.Num,
        );
        const expected = literals[name as keyof typeof literals];

        expect(generatedExpr.dataType).toStrictEqual(expected.dataType);
      }
    });
  });

  it('generates correct resources for member access expressions', ({ root }) => {
    const TestStruct = d.struct({
      a: d.u32,
      b: d.vec2u,
    });

    const testBuffer = root
      .createBuffer(TestStruct)
      .$usage('storage');

    const testUsage = testBuffer.as('mutable');

    const testFn = tgpu.fn([], d.u32)(() => {
      return testUsage.$.a + testUsage.$.b.x;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );
    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[1,[7,[7,"testUsage","$"],"a"],"+",[7,[7,[7,"testUsage","$"],"b"],"x"]]]]]"`,
    );
    ctx[$internal].itemStateStack.pushFunctionScope(
      'normal',
      [],
      {},
      d.u32,
      (astInfo.externals as () => Record<string, unknown>)() ?? {},
    );

    provideCtx(ctx, () => {
      // Check for: return testUsage.$.a + testUsage.$.b.x;
      //                   ^ this should be a u32
      const res1 = wgslGenerator.expression(
        // deno-fmt-ignore: it's better that way
        (
        (
          astInfo.ast?.body[1][0] as tinyest.Return
        )[1] as tinyest.BinaryExpression
      )[1],
      );

      expect(res1.dataType).toStrictEqual(d.u32);

      // Check for: return testUsage.$.a + testUsage.$.b.x;
      //                                       ^ this should be a u32
      const res2 = wgslGenerator.expression(
        // deno-fmt-ignore: it's better that way
        (
        (
          astInfo.ast?.body[1][0] as tinyest.Return
        )[1] as tinyest.BinaryExpression
      )[3],
      );
      expect(res2.dataType).toStrictEqual(d.u32);

      // Check for: return testUsage.$.a + testUsage.$.b.x;
      //            ^ this should be a u32
      const sum = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );
      expect(sum.dataType).toStrictEqual(d.u32);
    });
  });

  it('generates correct resources for external resource array index access', ({ root }) => {
    const testBuffer = root
      .createBuffer(d.arrayOf(d.u32, 16))
      .$usage('uniform');

    const testUsage = testBuffer.as('uniform');

    const testFn = tgpu.fn([], d.u32)(() => {
      return testUsage.$[3] as number;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[8,[7,"testUsage","$"],[5,"3"]]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.u32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: return testUsage.$[3];
      //                   ^ this should be a u32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.u32);
    });
  });

  it('generates correct resources for nested struct with atomics in a complex expression', ({ root }) => {
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
      .$usage('storage');

    const testUsage = testBuffer.as('mutable');

    const testFn = tgpu.fn([d.u32], d.vec4f)((idx) => {
      // oxlint-disable-next-line typescript/no-non-null-assertion <no thanks>
      const value = std.atomicLoad(testUsage.$.b.aa[idx]!.y);
      const vec = std.mix(d.vec4f(), testUsage.$.a, value);
      // oxlint-disable-next-line typescript/no-non-null-assertion <no thanks>
      std.atomicStore(testUsage.$.b.aa[idx]!.x, vec.y);
      return vec;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo?.ast) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[0,[[13,"value",[6,[7,"std","atomicLoad"],[[7,[8,[7,[7,[7,"testUsage","$"],"b"],"aa"],"idx"],"y"]]]],[13,"vec",[6,[7,"std","mix"],[[6,[7,"d","vec4f"],[]],[7,[7,"testUsage","$"],"a"],"value"]]],[6,[7,"std","atomicStore"],[[7,[8,[7,[7,[7,"testUsage","$"],"b"],"aa"],"idx"],"x"],[7,"vec","y"]]],[10,"vec"]]]"`,
    );

    if (
      astInfo.ast.params.filter((arg) => arg.type !== 'i').length > 0
    ) {
      throw new Error('Expected arguments as identifier names in ast');
    }

    const args = astInfo.ast.params.map((arg) =>
      snip(
        (arg as { type: 'i'; name: string }).name,
        d.u32,
        /* origin */ 'runtime',
      )
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        args,
        {},
        d.vec4f,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: const value = std.atomicLoad(testUsage.$.b.aa[idx]!.y);
      //                           ^ this part should be a i32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Const)[2] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.i32);

      // Check for: const vec = std.mix(d.vec4f(), testUsage.$.a, value);
      //                        ^ this part should be a vec4f
      ctx[$internal].itemStateStack.pushBlockScope();
      wgslGenerator.blockVariable('var', 'value', d.i32, 'runtime');
      const res2 = wgslGenerator.expression(
        (astInfo.ast?.body[1][1] as tinyest.Const)[2] as tinyest.Expression,
      );
      ctx[$internal].itemStateStack.pop('blockScope');

      expect(res2.dataType).toStrictEqual(d.vec4f);

      // Check for: std.atomicStore(testUsage.$.b.aa[idx]!.x, vec.y);
      //                            ^ this part should be an atomic u32
      //            ^ this part should be void
      ctx[$internal].itemStateStack.pushBlockScope();
      wgslGenerator.blockVariable('var', 'vec', d.vec4f, 'function');
      const res3 = wgslGenerator.expression(
        (astInfo.ast?.body[1][2] as tinyest.Call)[2][0] as tinyest.Expression,
      );
      const res4 = wgslGenerator.expression(
        astInfo.ast?.body[1][2] as tinyest.Expression,
      );
      ctx[$internal].itemStateStack.pop('blockScope');

      expect(res3.dataType).toStrictEqual(d.atomic(d.u32));
      expect(res4.dataType).toStrictEqual(Void);
    });
  });

  it('creates correct code for for statements', () => {
    const main = () => {
      'use gpu';
      for (let i = 0; i < 10; i += 1) {
        continue;
      }
    };

    const parsed = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[0,[[14,[12,"i",[5,"0"]],[1,"i","<",[5,"10"]],[2,"i","+=",[5,"1"]],[0,[[16]]]]]]"`,
    );

    const gen = provideCtx(
      ctx,
      () => wgslGenerator.functionDefinition(parsed),
    );

    expect(gen).toMatchInlineSnapshot(`
      "{
        for (var i = 0; (i < 10i); i += 1i) {
          continue;
        }
      }"
    `);
  });

  it('creates correct code for for statements with outside init', () => {
    const main = () => {
      'use gpu';
      let i = 0;
      for (; i < 10; i += 1) {
        continue;
      }
    };

    const parsed = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[0,[[12,"i",[5,"0"]],[14,null,[1,"i","<",[5,"10"]],[2,"i","+=",[5,"1"]],[0,[[16]]]]]]"`,
    );

    const gen = provideCtx(
      ctx,
      () => wgslGenerator.functionDefinition(parsed),
    );

    expect(gen).toMatchInlineSnapshot(`
      "{
        var i = 0;
        for (; (i < 10i); i += 1i) {
          continue;
        }
      }"
    `);
  });

  it('creates correct code for while statements', () => {
    const main = () => {
      'use gpu';
      let i = 0;
      while (i < 10) {
        i += 1;
      }
    };

    const parsed = getMetaData(main)?.ast?.body as tinyest.Block;
    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[0,[[12,"i",[5,"0"]],[15,[1,"i","<",[5,"10"]],[0,[[2,"i","+=",[5,"1"]]]]]]]"`,
    );

    const gen = provideCtx(
      ctx,
      () => wgslGenerator.functionDefinition(parsed),
    );

    expect(gen).toMatchInlineSnapshot(`
      "{
        var i = 0;
        while ((i < 10i)) {
          i += 1i;
        }
      }"
    `);
  });

  it('parses correctly "for ... of ..." statements', () => {
    const main1 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        continue;
      }
    };

    const main2 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (let foo of arr) {
        continue;
      }
    };

    const parsed1 = getMetaData(main1)?.ast?.body;
    expect(JSON.stringify(parsed1)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[5,"1"],[5,"2"],[5,"3"]]]],[18,[13,"foo"],"arr",[0,[[16]]]]]]"`,
    );

    const parsed2 = getMetaData(main2)?.ast?.body;
    expect(JSON.stringify(parsed2)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[5,"1"],[5,"2"],[5,"3"]]]],[18,[12,"foo"],"arr",[0,[[16]]]]]]"`,
    );
  });

  it('creates correct code for "for ... of ..." statement using array of primitives', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        res += foo;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            res += foo;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." nested statements', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        for (const boo of arr) {
          res += foo * boo;
        }
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            for (var i_1 = 0u; i_1 < 3u; i_1++) {
              let boo = arr[i_1];
              {
                res += (foo * boo);
              }
            }
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." nested statements that use the same variable name', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        for (const foo of arr) {
          res += foo * foo;
        }
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            for (var i_1 = 0u; i_1 < 3u; i_1++) {
              let foo2 = arr[i_1];
              {
                res += (foo2 * foo2);
              }
            }
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using array of non-primitives', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.vec2f, 3)([d.vec2f(1), d.vec2f(2), d.vec2f(3)]);
      let res = 0;
      for (const foo of arr) {
        res += foo.x;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<vec2f, 3>(vec2f(1), vec2f(2), vec2f(3));
        var res = 0;
        for (var i = 0u; i < 3u; i++) {
          let foo = (&arr[i]);
          {
            res += i32((*foo).x);
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using runtime size array', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const main = () => {
      'use gpu';
      let res = d.f32(0);
      for (const foo of layout.$.arr) {
        res += foo;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> arr: array<f32>;

      fn main() {
        var res = 0f;
        for (var i = 0u; i < arrayLength((&arr)); i++) {
          let foo = arr[i];
          {
            res += foo;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using lazy and comptime iterables', () => {
    const comptimeVec = tgpu.comptime(() => d.vec2f(1, 2));

    const main = () => {
      'use gpu';
      const v1 = lazyV4u.$;
      for (const foo of v1) {
        continue;
      }

      const v2 = comptimeVec();
      for (const foo of v2) {
        continue;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var v1 = vec4u(44, 88, 132, 176);
        for (var i = 0u; i < 4u; i++) {
          let foo = v1[i];
          {
            continue;
          }
        }
        var v2 = vec2f(1, 2);
        for (var i = 0u; i < 2u; i++) {
          let foo = v2[i];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using buffer iterable', ({ root }) => {
    const b = root.createUniform(d.arrayOf(d.u32, 7));
    const acc = tgpu.accessor(d.arrayOf(d.u32, 7), b);

    const f = () => {
      'use gpu';
      let result = d.u32(0);
      for (const foo of acc.$) {
        result += foo;
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> b: array<u32, 7>;

      fn f() -> u32 {
        var result = 0u;
        for (var i = 0u; i < 7u; i++) {
          let foo = b[i];
          {
            result += foo;
          }
        }
        return result;
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using vector iterables', () => {
    const main = () => {
      'use gpu';
      const v1 = d.vec4f(1, 2, 3, 4);
      const v2 = d.vec3u(5, 6, 7);
      const v3 = d.vec2b(true, false);

      let res1 = d.f32();
      let res2 = d.u32();
      let res3 = d.bool();

      for (const foo of v1) {
        res1 += foo;
      }

      for (const foo of v2) {
        res2 *= foo;
      }

      for (const foo of v3) {
        res3 = foo !== res3;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var v1 = vec4f(1, 2, 3, 4);
        var v2 = vec3u(5, 6, 7);
        var v3 = vec2<bool>(true, false);
        var res1 = 0f;
        var res2 = 0u;
        var res3 = false;
        for (var i = 0u; i < 4u; i++) {
          let foo = v1[i];
          {
            res1 += foo;
          }
        }
        for (var i = 0u; i < 3u; i++) {
          let foo = v2[i];
          {
            res2 *= foo;
          }
        }
        for (var i = 0u; i < 2u; i++) {
          let foo = v3[i];
          {
            res3 = (foo != res3);
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using a struct member iterable', () => {
    const TestStruct = d.struct({
      arr: d.arrayOf(d.f32, 4),
    });

    const main = () => {
      'use gpu';
      const testStruct = TestStruct({ arr: [1, 8, 8, 2] });
      for (const foo of testStruct.arr) {
        continue;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct TestStruct {
        arr: array<f32, 4>,
      }

      fn main() {
        var testStruct = TestStruct(array<f32, 4>(1f, 8f, 8f, 2f));
        for (var i = 0u; i < 4u; i++) {
          let foo = testStruct.arr[i];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('throws error when "for ... of ..." statement uses an ephemeral iterable', () => {
    const main = () => {
      'use gpu';
      for (const foo of [1, 2, 3]) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): \`for ... of ...\` loops only support iterables stored in variables.
        -----
        You can wrap iterable with \`tgpu.unroll(...)\`. If iterable is known at comptime, the loop will be unrolled.
        -----]
    `);
  });

  it('throws error when "for ... of ..." statement uses iterable that is not an array or a vector', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.f32,
    });

    const main = () => {
      'use gpu';
      const testStruct = TestStruct({ x: 1, y: 2 });
      // @ts-expect-error: let's assume it has an iterator
      for (const foo of testStruct) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): \`for ... of ...\` loops only support array or vector iterables]
    `);
  });

  it('throws error when "for ... of ..." statement uses let declarator', () => {
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (let foo of arr) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Only \`for (const ... of ... )\` loops are supported]
    `);
  });

  it('throws error when "for ... of ..." loop variable name is not correct in wgsl', () => {
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const __foo of arr) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Invalid identifier '__foo'. Choose an identifier without whitespaces or leading underscores.]
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is used by user', () => {
    const f1 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const i = foo;
      }
    };

    expect(tgpu.resolve([f1])).toMatchInlineSnapshot(`
      "fn f1() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            let i_1 = foo;
          }
        }
      }"
    `);

    const f2 = () => {
      'use gpu';
      const i = 7;
      const arr = [1, 2, 3];
      for (const foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([f2])).toMatchInlineSnapshot(`
      "fn f2() {
        const i = 7;
        var arr = array<i32, 3>(1, 2, 3);
        for (var i_1 = 0u; i_1 < 3u; i_1++) {
          let foo = arr[i_1];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer used earlier', ({ root }) => {
    const i = root.createUniform(d.u32, 7);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3, i.$];
      for (const foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i: u32;

      fn f() {
        var arr = array<u32, 4>(1u, 2u, 3u, i);
        for (var i_1 = 0u; i_1 < 4u; i_1++) {
          let foo = arr[i_1];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer used later', ({ root }) => {
    const i = root.createUniform(d.u32, 7);
    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const x = foo + i.$;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i_1: u32;

      fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            let x = (foo + i32(i_1));
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer returned from accessor', ({ root }) => {
    const i = root.createUniform(d.u32, 7);

    const acc = tgpu.accessor(d.u32, () => i.$);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const x = foo + acc.$;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i_1: u32;

      fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i++) {
          let foo = arr[i];
          {
            let x = (foo + i32(i_1));
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the loop variable', () => {
    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      let res = 0;
      for (const i of arr) {
        res += i;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        var res = 0;
        for (var i = 0u; i < 3u; i++) {
          let i_1 = arr[i];
          {
            res += i_1;
          }
        }
      }"
    `);
  });

  // TODO: enable when we transition to `rolldown`
  // it('handles "for ... of ..." loop variable name when there is shadowning', ({ root }) => {
  //   const i = root.createUniform(d.u32, 7);

  //   const f = () => {
  //     'use gpu';
  //     const arr = [1, 2, 3, i.$];
  //     let res = 0;
  //     for (const i of arr) {
  //       res += i;
  //     }
  //   };

  //   expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
  //     "@group(0) @binding(0) var<uniform> i: u32;

  //     fn f() {
  //       var arr = array<u32, 4>(1u, 2u, 3u, i);
  //       var res = 0;
  //       for (var i_1 = 0u; i_1 < 4; i_1++) {
  //         let i_2 = arr[i_1];
  //         {
  //           res += i32(i_2);
  //         }
  //       }
  //     }"
  //   `);
  // });

  it('creates correct resources for lazy values and slots', () => {
    const testFn = tgpu.fn([], d.vec4u)(() => lazyV4u.$);

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> vec4u {
        return vec4u(44, 88, 132, 176);
      }"
    `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[7,"lazyV4u","$"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.vec4u,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      wgslGenerator.initGenerator(ctx);
      // Check for: return lazyV4u.$;
      //                      ^ this should be a vec4u
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.vec4u);
    });
  });

  it('creates correct resources for indexing into a lazy value', () => {
    const testFn = tgpu.fn([d.u32], d.f32)((idx) => {
      return lazyV2f.$[idx] as number;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[8,[7,"lazyV2f","$"],"idx"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [snip('idx', d.u32, /* origin */ 'runtime')],
        {},
        d.f32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: return lazyV2f.$[idx];
      //                      ^ this should be a f32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.f32);
    });
  });

  it('creates intermediate representation for array expression', () => {
    const testFn = () => {
      'use gpu';
      [d.u32(1), 8, 8, 2];
    };

    const snippet = extractSnippetFromFn(testFn);

    expect(snippet.value instanceof ArrayExpression).toBe(true);
    expect((snippet.value as ArrayExpression).type.elementType.type)
      .toStrictEqual('u32');
    expect((snippet.value as ArrayExpression).type.elementCount)
      .toStrictEqual(4);
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      const arr = [d.u32(1), 2, 3];
      return arr[1] as number;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
        "fn testFn() -> u32 {
          var arr = array<u32, 3>(1u, 2u, 3u);
          return arr[1i];
        }"
      `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[6,[7,"d","u32"],[[5,"1"]]],[5,"2"],[5,"3"]]]],[10,[8,"arr",[5,"1"]]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.u32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: const arr = [1, 2, 3]
      //                        ^ this should be an array<u32, 3>
      wgslGenerator.initGenerator(ctx);
      const res = wgslGenerator.expression(
        // deno-fmt-ignore: it's better that way
        (
          astInfo.ast?.body[1][0] as tinyest.Const
        )[2] as unknown as tinyest.Expression,
      );

      expect(d.isWgslArray(res.dataType)).toBe(true);
      expect((res.dataType as unknown as WgslArray).elementCount).toBe(3);
      expect((res.dataType as unknown as WgslArray).elementType).toBe(d.u32);
    });
  });

  it('generates correct code for complex array expressions', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      const arr = [
        d.vec2u(1, 2),
        d.vec2u(3, 4),
        std.min(d.vec2u(5, 8), d.vec2u(7, 6)),
      ] as [d.v2u, d.v2u, d.v2u];
      return arr[1].x;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var arr = array<vec2u, 3>(vec2u(1, 2), vec2u(3, 4), vec2u(5, 6));
        return arr[1i].x;
      }"
    `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[6,[7,"d","vec2u"],[[5,"1"],[5,"2"]]],[6,[7,"d","vec2u"],[[5,"3"],[5,"4"]]],[6,[7,"std","min"],[[6,[7,"d","vec2u"],[[5,"5"],[5,"8"]]],[6,[7,"d","vec2u"],[[5,"7"],[5,"6"]]]]]]]],[10,[7,[8,"arr",[5,"1"]],"x"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.u32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: const arr = [1, 2, 3]
      //                        ^ this should be an array<u32, 3>
      wgslGenerator.initGenerator(ctx);
      const res = wgslGenerator.expression(
        // deno-fmt-ignore: it's better that way
        (
          astInfo.ast?.body[1][0] as tinyest.Const
        )[2] as unknown as tinyest.Expression,
      );

      expect(d.isWgslArray(res.dataType)).toBe(true);
      expect((res.dataType as unknown as WgslArray).elementCount).toBe(3);
      expect((res.dataType as unknown as WgslArray).elementType).toBe(d.vec2u);
    });
  });

  it('does not autocast lhs of an assignment', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      let a = d.u32(12);
      const b = d.f32(2.5);
      a = b;

      return a;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var a = 12u;
        const b = 2.5f;
        a = u32(b);
        return a;
      }"
    `);
  });

  it('generates correct code for array expressions with struct elements', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.f32,
    });

    const testFn = tgpu.fn([], d.f32)(() => {
      const arr = [TestStruct({ x: 1, y: 2 }), TestStruct({ x: 3, y: 4 })];
      return (arr[1] as { x: number; y: number }).y;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: f32,
      }

      fn testFn() -> f32 {
        var arr = array<TestStruct, 2>(TestStruct(1u, 2f), TestStruct(3u, 4f));
        return arr[1i].y;
      }"
    `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[6,"TestStruct",[[104,{"x":[5,"1"],"y":[5,"2"]}]]],[6,"TestStruct",[[104,{"x":[5,"3"],"y":[5,"4"]}]]]]]],[10,[7,[8,"arr",[5,"1"]],"y"]]]]"`,
    );

    const res = provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.f32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      // Check for: const arr = [TestStruct({ x: 1, y: 2 }), TestStruct({ x: 3, y: 4 })];
      //                        ^ this should be an array<TestStruct, 2>
      wgslGenerator.initGenerator(ctx);
      return wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Const)[2] as tinyest.Expression,
      );
    });

    expect(d.isWgslArray(res.dataType)).toBe(true);
    expect((res.dataType as unknown as WgslArray).elementCount).toBe(2);
    expect((res.dataType as unknown as WgslArray).elementType).toBe(TestStruct);
  });

  it('generates correct code for array expressions with lazy elements', () => {
    const testFn = tgpu.fn([], d.f32)(() => {
      const arr = [lazyV2f.$, std.mul(lazyV2f.$, d.vec2f(2, 2))];
      return (arr[1] as d.v2f).y;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> f32 {
        var arr = array<vec2f, 2>(vec2f(44, 88), vec2f(88, 176));
        return arr[1i].y;
      }"
    `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[7,"lazyV2f","$"],[6,[7,"std","mul"],[[7,"lazyV2f","$"],[6,[7,"d","vec2f"],[[5,"2"],[5,"2"]]]]]]]],[10,[7,[8,"arr",[5,"1"]],"y"]]]]"`,
    );

    const res = provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.f32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      wgslGenerator.initGenerator(ctx);
      return wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Const)[2] as tinyest.Expression,
      );
    });

    expect(d.isWgslArray(res.dataType)).toBe(true);
    expect((res.dataType as unknown as WgslArray).elementCount).toBe(2);
    expect((res.dataType as unknown as WgslArray).elementType).toBe(d.vec2f);
  });

  it('allows for member access on values returned from function calls', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.vec3f,
    });

    const fnOne = tgpu.fn([], TestStruct)(() => {
      return TestStruct({ x: 1, y: d.vec3f(1, 2, 3) });
    });

    const fnTwo = tgpu.fn([], d.f32)(() => {
      return fnOne().y.x;
    });

    expect(tgpu.resolve([fnTwo])).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: vec3f,
      }

      fn fnOne() -> TestStruct {
        return TestStruct(1u, vec3f(1, 2, 3));
      }

      fn fnTwo() -> f32 {
        return fnOne().y.x;
      }"
    `);

    const astInfo = getMetaData(
      fnTwo[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[7,[7,[6,"fnOne",[]],"y"],"x"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.f32,
        (astInfo.externals as () => Record<string, unknown>)() ?? {},
      );

      wgslGenerator.initGenerator(ctx);
      // Check for: return fnOne().y.x;
      //                   ^ this should be a f32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.f32);
    });
  });

  it('generates correct code for conditional with single statement', () => {
    const main0 = tgpu.fn([d.bool], d.u32)((cond) => {
      if (cond) return 0;
      return 1;
    });

    expect(tgpu.resolve([main0])).toMatchInlineSnapshot(`
      "fn main0(cond: bool) -> u32 {
        if (cond) {
          return 0u;
        }
        return 1u;
      }"
    `);
  });

  it('generates correct code for conditional with else', () => {
    const main1 = tgpu.fn([d.bool], d.i32)((cond) => {
      let y = 0;
      if (cond) y = 1;
      else y = 2;
      return y;
    });

    expect(tgpu.resolve([main1])).toMatchInlineSnapshot(`
      "fn main1(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1i;
        }
        else {
          y = 2i;
        }
        return y;
      }"
    `);
  });

  it('generates correct code for conditionals block', () => {
    const main2 = tgpu.fn([d.bool], d.i32)((cond) => {
      let y = 0;
      if (cond) {
        y = 1;
      } else y = 2;
      return y;
    });

    expect(tgpu.resolve([main2])).toMatchInlineSnapshot(`
      "fn main2(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1i;
        }
        else {
          y = 2i;
        }
        return y;
      }"
    `);
  });

  it('generates correct code for for loops with single statements', () => {
    const main = () => {
      'use gpu';
      for (let i = 0; i < 10; i += 1) {
        continue;
      }
    };

    const gen = provideCtx(
      ctx,
      () =>
        wgslGenerator.functionDefinition(
          getMetaData(main)?.ast?.body as tinyest.Block,
        ),
    );

    expect(gen).toMatchInlineSnapshot(`
      "{
        for (var i = 0; (i < 10i); i += 1i) {
          continue;
        }
      }"
    `);
  });

  it('generates correct code for while loops with single statements', () => {
    const main = tgpu.fn([])(() => {
      let i = 0;
      while (i < 10) i += 1;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var i = 0;
        while ((i < 10i)) {
          i += 1i;
        }
      }"
    `);
  });

  it('throws error when incorrectly initializing function', () => {
    const internalTestFn = tgpu.fn([d.vec2f], d.mat4x4f)(() => {
      return d.mat4x4f();
    });

    const testFn = tgpu.fn([])(() => {
      // @ts-expect-error
      return internalTestFn([1, 23, 3]);
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Cannot convert value of type 'arrayOf(i32, 3)' to any of the target types: [vec2f]]
    `);
  });

  it('throws error when initializing translate4 function', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      return std.translate4();
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - fn:translate4: Cannot read properties of undefined (reading 'x')]
    `);
  });

  it('throws error when initializing vec4f with an array', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      const x = d.vec4f([1, 2, 3, 4]);
      return d.mat4x4f();
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - fn:vec4f: Cannot convert value of type 'arrayOf(i32, 4)' to any of the target types: [f32]]
    `);
  });

  it('generates correct code for pointer value assignment', () => {
    const increment = tgpu.fn([d.ptrFn(d.f32)])((val) => {
      val.$ += 1;
    });

    expect(tgpu.resolve([increment])).toMatchInlineSnapshot(`
      "fn increment(val: ptr<function, f32>) {
        (*val) += 1f;
      }"
    `);
  });

  it('renames variables that would result in invalid WGSL', () => {
    const main = tgpu.fn([], d.i32)(() => {
      const notAKeyword = 0;
      const struct = 1;
      return struct;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        const notAKeyword = 0;
        const struct_1 = 1;
        return struct_1;
      }"
    `);
  });

  it('renames parameters that would result in invalid WGSL', () => {
    const main = tgpu.fn([d.i32, d.i32], d.i32)((n, macro) => {
      return n + macro;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(n: i32, macro_1: i32) -> i32 {
        return (n + macro_1);
      }"
    `);
  });

  it('throws when an identifier starts with underscores', () => {
    const main1 = tgpu.fn([])(() => {
      const _ = 1;
    });

    const main2 = tgpu.fn([])(() => {
      const __my_var = 1;
    });

    expect(() => tgpu.resolve([main1]))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:main1: Invalid identifier '_'. Choose an identifier without whitespaces or leading underscores.]
      `);
    expect(() => tgpu.resolve([main2]))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:main2: Invalid identifier '__my_var'. Choose an identifier without whitespaces or leading underscores.]
      `);
  });

  it('does not cause identifier clashes when renaming variables', () => {
    const main = tgpu.fn([])(() => {
      const mut = 1;
      const mut_1 = 2;
      const mut_1_2 = 2;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const mut_1 = 1;
        const mut_1_1 = 2;
        const mut_1_2 = 2;
      }"
    `);
  });

  it('does not cause identifier clashes when renaming parameters', () => {
    const main = tgpu.fn([d.u32, d.u32])((extern, extern_1) => {
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(extern_1: u32, extern_1_1: u32) {

      }"
    `);
  });

  it('generates correct code for pow expression', () => {
    const power = tgpu.fn([])(() => {
      const a = d.f32(10);
      const b = d.f32(3);
      const n = a ** b;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const a = 10f;
        const b = 3f;
        let n = pow(a, b);
      }"
    `);
  });

  it('calculates pow at comptime when possible', () => {
    const four = 4;
    const power = tgpu.fn([])(() => {
      const n = 2 ** four;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const n = 16.;
      }"
    `);
  });

  it('casts in pow expression when necessary', () => {
    const power = tgpu.fn([])(() => {
      const a = d.u32(3);
      const b = d.i32(5);
      const m = a ** b;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const a = 3u;
        const b = 5i;
        let m = pow(f32(a), f32(b));
      }"
    `);
  });

  it('throws error when accessing matrix elements directly', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const element = matrix[4];
    });

    expect(() => tgpu.resolve([testFn]))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:testFn: The only way of accessing matrix elements in TypeGPU functions is through the 'columns' property.]
      `);
  });

  it('generates correct code when accessing matrix elements through .columns', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const column = matrix.columns[1];
      const element = column[0];
      const directElement = matrix.columns[1][0];
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var matrix = mat4x4f(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        let column = (&matrix[1i]);
        let element = (*column)[0i];
        let directElement = matrix[1i][0i];
      }"
    `);
  });

  it('resolves when accessing matrix elements through .columns', () => {
    const matrix = tgpu.workgroupVar(d.mat4x4f);
    const index = tgpu.workgroupVar(d.u32);

    const testFn = tgpu.fn([])(() => {
      const element = matrix.$.columns[index.$];
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "var<workgroup> matrix: mat4x4f;

      var<workgroup> index: u32;

      fn testFn() {
        let element = (&matrix[index]);
      }"
    `);
  });

  it('throws a descriptive error when accessing an external array with a runtime known index', () => {
    const myArray = [9, 8, 7, 6];

    const testFn = tgpu.fn([d.u32], d.u32)((i) => {
      return myArray[i] as number;
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Value undefined (as json: undefined) is not resolvable to type u32]
    `);
  });

  it('throws a descriptive error when declaring a const inside TGSL', () => {
    const testFn = tgpu.fn([d.u32], d.u32)((i) => {
      const myArray = tgpu.const(d.arrayOf(d.u32, 4), [9, 8, 7, 6]);
      return myArray.$[i] as number;
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Constants cannot be defined within TypeGPU function scope. To address this, move the constant definition outside the function scope.]
    `);
  });

  it('generates correct indentation for nested blocks', () => {
    const main = tgpu.fn([], d.i32)(() => {
      let res = 0;
      {
        const f = 2;
        res += f;
      }
      return res;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        var res = 0;
        {
          const f = 2;
          res += f;
        }
        return res;
      }"
    `);
  });

  it('block externals do not override identifiers', () => {
    const f = () => {
      'use gpu';
      const y = 100;
      const x = y;
      return x;
    };

    const parsed = getMetaData(f)?.ast?.body as tinyest.Block;

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.u32,
        {},
      );

      const res = wgslGenerator.block(
        parsed,
        { x: 42 },
      );

      expect(res).toMatchInlineSnapshot(`
          "{
            const y = 100;
            const x = y;
            return u32(x);
          }"
        `);
    });
  });

  it('block externals are injected correctly', () => {
    const f = () => {
      'use gpu';
      for (const x of []) {
        const y = x;
      }
    };

    const parsed = getMetaData(f)?.ast?.body as tinyest.Block;

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.Void,
        {},
      );

      const res = wgslGenerator.block(
        (parsed[1][0] as tinyest.ForOf)[3] as tinyest.Block,
        { x: 67 },
      );

      expect(res).toMatchInlineSnapshot(`
          "{
            const y = 67;
          }"
        `);
    });
  });

  it('block externals are respected in nested blocks', () => {
    const f = () => {
      'use gpu';
      let result = d.i32(0);
      const list = d.arrayOf(d.i32, 3)([1, 2, 3]);
      for (const elem of list) {
        {
          // We use the `elem` in a nested block
          result += elem;
        }
      }
    };

    const parsed = getMetaData(f)?.ast?.body as tinyest.Block;

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        'normal',
        [],
        {},
        d.Void,
        {},
      );

      const res = wgslGenerator.block(
        (parsed[1][2] as tinyest.ForOf)[3] as tinyest.Block,
        { result: snip('result', d.i32, 'function'), elem: 7 },
      );

      expect(res).toMatchInlineSnapshot(`
        "{
          {
            result += 7i;
          }
        }"
      `);
    });
  });
});

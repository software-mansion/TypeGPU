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
import { asWgsl } from '../utils/parseResolved.ts';

const { NodeTypeCatalog: NODE } = tinyest;

const numberSlot = tgpu.slot(44);
const derivedV4u = tgpu['~unstable'].derived(() =>
  std.mul(d.u32(numberSlot.value), d.vec4u(1, 2, 3, 4))
);
const derivedV2f = tgpu['~unstable'].derived(() =>
  std.mul(d.f32(numberSlot.value), d.vec2f(1, 2))
);

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
      'kernel';
      return true;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[0,[[10,true]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope([], {}, d.bool, {});
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
      'kernel';
      let a = 12;
      a += 21;
      return a;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[0,[[12,"a",[5,"12"]],[2,"a","+=",[5,"21"]],[10,"a"]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope([], {}, d.i32, {});
      const gen = wgslGenerator.functionDefinition(parsedBody);
      expect(gen).toMatchInlineSnapshot(`
        "{
          var a = 12;
          a += 21;
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
      'kernel';
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
      for (const stmt of (parsedBody as tinyest.Block)[1]) {
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
      return testUsage.value.a + testUsage.value.b.x;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );
    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[1,[7,[7,"testUsage","value"],"a"],"+",[7,[7,[7,"testUsage","value"],"b"],"x"]]]]]"`,
    );
    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.u32,
      astInfo.externals ?? {},
    );

    provideCtx(ctx, () => {
      // Check for: return testUsage.value.a + testUsage.value.b.x;
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

      // Check for: return testUsage.value.a + testUsage.value.b.x;
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

      // Check for: return testUsage.value.a + testUsage.value.b.x;
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
      return testUsage.value[3] as number;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[8,[7,"testUsage","value"],[5,"3"]]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        [],
        {},
        d.u32,
        astInfo.externals ?? {},
      );

      // Check for: return testUsage.value[3];
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
      // biome-ignore lint/style/noNonNullAssertion: <no thanks>
      const value = std.atomicLoad(testUsage.value.b.aa[idx]!.y);
      const vec = std.mix(d.vec4f(), testUsage.value.a, value);
      // biome-ignore lint/style/noNonNullAssertion: <no thanks>
      std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
      return vec;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo?.ast) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[0,[[13,"value",[6,[7,"std","atomicLoad"],[[7,[8,[7,[7,[7,"testUsage","value"],"b"],"aa"],"idx"],"y"]]]],[13,"vec",[6,[7,"std","mix"],[[6,[7,"d","vec4f"],[]],[7,[7,"testUsage","value"],"a"],"value"]]],[6,[7,"std","atomicStore"],[[7,[8,[7,[7,[7,"testUsage","value"],"b"],"aa"],"idx"],"x"],[7,"vec","y"]]],[10,"vec"]]]"`,
    );

    if (
      astInfo.ast.params.filter((arg) => arg.type !== 'i').length > 0
    ) {
      throw new Error('Expected arguments as identifier names in ast');
    }

    const args = astInfo.ast.params.map((arg) =>
      snip((arg as { type: 'i'; name: string }).name, d.u32)
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        args,
        {},
        d.vec4f,
        astInfo.externals ?? {},
      );

      // Check for: const value = std.atomicLoad(testUsage.value.b.aa[idx]!.y);
      //                           ^ this part should be a i32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Const)[2],
      );

      expect(res.dataType).toStrictEqual(d.i32);

      // Check for: const vec = std.mix(d.vec4f(), testUsage.value.a, value);
      //                        ^ this part should be a vec4f
      ctx[$internal].itemStateStack.pushBlockScope();
      wgslGenerator.blockVariable('value', d.i32);
      const res2 = wgslGenerator.expression(
        (astInfo.ast?.body[1][1] as tinyest.Const)[2],
      );
      ctx[$internal].itemStateStack.popBlockScope();

      expect(res2.dataType).toStrictEqual(d.vec4f);

      // Check for: std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
      //                            ^ this part should be an atomic u32
      //            ^ this part should be void
      ctx[$internal].itemStateStack.pushBlockScope();
      wgslGenerator.blockVariable('vec', d.vec4f);
      const res3 = wgslGenerator.expression(
        (astInfo.ast?.body[1][2] as tinyest.Call)[2][0] as tinyest.Expression,
      );
      const res4 = wgslGenerator.expression(
        astInfo.ast?.body[1][2] as tinyest.Expression,
      );
      ctx[$internal].itemStateStack.popBlockScope();

      expect(res3.dataType).toStrictEqual(d.atomic(d.u32));
      expect(res4.dataType).toStrictEqual(Void);
    });
  });

  it('creates correct code for for statements', () => {
    const main = () => {
      'kernel';
      for (let i = 0; i < 10; i += 1) {
        // biome-ignore lint/correctness/noUnnecessaryContinue: it's just a test, chill
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
        for (var i = 0; (i < 10); i += 1) {
          continue;
        }
      }"
    `);
  });

  it('creates correct code for for statements with outside init', () => {
    const main = () => {
      'kernel';
      let i = 0;
      for (; i < 10; i += 1) {
        // biome-ignore lint/correctness/noUnnecessaryContinue: it's just a test, chill
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
        for (; (i < 10); i += 1) {
          continue;
        }
      }"
    `);
  });

  it('creates correct code for while statements', () => {
    const main = () => {
      'kernel';
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
        while ((i < 10)) {
          i += 1;
        }
      }"
    `);
  });

  it('creates correct resources for derived values and slots', () => {
    const testFn = tgpu.fn([], d.vec4u)(() => {
      return derivedV4u.value;
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
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
      `"[0,[[10,[7,"derivedV4u","value"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        [],
        {},
        d.vec4u,
        astInfo.externals ?? {},
      );

      wgslGenerator.initGenerator(ctx);
      // Check for: return derivedV4u.value;
      //                      ^ this should be a vec4u
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.vec4u);
    });
  });

  it('creates correct resources for indexing into a derived value', () => {
    const testFn = tgpu.fn([d.u32], d.f32)((idx) => {
      return derivedV2f.value[idx] as number;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[8,[7,"derivedV2f","value"],"idx"]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        [snip('idx', d.u32)],
        {},
        d.f32,
        astInfo.externals ?? {},
      );

      // Check for: return derivedV2f.value[idx];
      //                      ^ this should be a f32
      const res = wgslGenerator.expression(
        (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
      );

      expect(res.dataType).toStrictEqual(d.f32);
    });
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      const arr = [d.u32(1), 2, 3];
      return arr[1] as number;
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var arr = array<u32, 3>(1, 2, 3);
        return arr[1];
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
        [],
        {},
        d.u32,
        astInfo.externals ?? {},
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

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var arr = array<vec2u, 3>(vec2u(1, 2), vec2u(3, 4), vec2u(5, 6));
        return arr[1].x;
      }"
    `);
  });

  it('does not autocast lhs of an assignment', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      let a = d.u32(12);
      const b = d.f32(2.5);
      a = b;

      return a;
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var a = 12u;
        var b = 2.5f;
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

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: f32,
      }

      fn testFn() -> f32 {
        var arr = array<TestStruct, 2>(TestStruct(1, 2), TestStruct(3, 4));
        return arr[1].y;
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
        [],
        {},
        d.f32,
        astInfo.externals ?? {},
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

  it('generates correct code for array expressions with derived elements', () => {
    const testFn = tgpu.fn([], d.f32)(() => {
      const arr = [derivedV2f.$, std.mul(derivedV2f.$, d.vec2f(2, 2))];
      return (arr[1] as d.v2f).y;
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "fn testFn() -> f32 {
        var arr = array<vec2f, 2>(vec2f(44, 88), vec2f(88, 176));
        return arr[1].y;
      }"
    `);

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[7,"derivedV2f","$"],[6,[7,"std","mul"],[[7,"derivedV2f","$"],[6,[7,"d","vec2f"],[[5,"2"],[5,"2"]]]]]]]],[10,[7,[8,"arr",[5,"1"]],"y"]]]]"`,
    );
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

    expect(asWgsl(fnTwo)).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: vec3f,
      }

      fn fnOne() -> TestStruct {
        return TestStruct(1, vec3f(1, 2, 3));
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
        [],
        {},
        d.f32,
        astInfo.externals ?? {},
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

  it('properly handles .value struct properties in slots', ({ root }) => {
    const UnfortunateStruct = d.struct({
      value: d.vec3f,
    });

    const testBuffer = root.createBuffer(UnfortunateStruct).$usage('storage');

    const testUsage = testBuffer.as('mutable');
    const testSlot = tgpu.slot(testUsage);
    const testFn = tgpu.fn([], d.f32)(() => {
      const value = testSlot.value.value;
      return value.x + value.y + value.z;
    });

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"value",[7,[7,"testSlot","value"],"value"]],[10,[1,[1,[7,"value","x"],"+",[7,"value","y"]],"+",[7,"value","z"]]]]]"`,
    );

    provideCtx(ctx, () => {
      ctx[$internal].itemStateStack.pushFunctionScope(
        [],
        {},
        d.f32,
        astInfo.externals ?? {},
      );

      // Check for: const value = testSlot.value.value;
      //                  ^ this should be a vec3f
      const res = wgslGenerator.expression(
        (
          astInfo.ast?.body[1][0] as tinyest.Const
        )[2] as unknown as tinyest.Expression,
      );

      expect(res.dataType).toEqual(d.vec3f);
    });
  });

  it('generates correct code for conditional with single statement', () => {
    const main0 = tgpu.fn([d.bool], d.u32)((cond) => {
      if (cond) return 0;
      return 1;
    });

    expect(asWgsl(main0)).toMatchInlineSnapshot(`
      "fn main0(cond: bool) -> u32 {
        if (cond) {
          return 0;
        }
        return 1;
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

    expect(asWgsl(main1)).toMatchInlineSnapshot(`
      "fn main1(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1;
        }
        else {
          y = 2;
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

    expect(asWgsl(main2)).toMatchInlineSnapshot(`
      "fn main2(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1;
        }
        else {
          y = 2;
        }
        return y;
      }"
    `);
  });

  it('generates correct code for for loops with single statements', () => {
    const main = () => {
      'kernel';
      // biome-ignore lint/correctness/noUnnecessaryContinue: sshhhh, it's just a test
      for (let i = 0; i < 10; i += 1) continue;
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
        for (var i = 0; (i < 10); i += 1) {
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

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main() {
        var i = 0;
        while ((i < 10)) {
          i += 1;
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

    expect(() => asWgsl(testFn)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - internalTestFn: Cannot convert value of type 'array' to type 'vec2f']
    `);
  });

  it('throws error when initializing translate4 function', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      return std.translate4();
    });

    expect(() => asWgsl(testFn)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - translate4: Cannot read properties of undefined (reading 'dataType')]
    `);
  });

  it('throws error when initializing vec4f with an array', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      const x = d.vec4f([1, 2, 3, 4]);
      return d.mat4x4f();
    });

    expect(() => asWgsl(testFn)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - vec4f: Cannot convert value of type 'array' to type 'f32']
    `);
  });

  it('generates correct code for pointer value assignment', () => {
    const increment = tgpu.fn([d.ptrFn(d.f32)])((val) => {
      // biome-ignore  lint/style/noParameterAssign: go away
      val += 1;
    });

    expect(asWgsl(increment)).toMatchInlineSnapshot(`
      "fn increment(val: ptr<function, f32>) {
        *val += 1;
      }"
    `);
  });

  it('renames variables that would result in invalid WGSL', () => {
    const main = tgpu.fn([], d.i32)(() => {
      const notAKeyword = 0;
      const struct = 1;
      return struct;
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        var notAKeyword = 0;
        var struct_1 = 1;
        return struct_1;
      }"
    `);
  });

  it('renames parameters that would result in invalid WGSL', () => {
    const main = tgpu.fn([d.i32, d.i32], d.i32)((n, macro) => {
      return n + macro;
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main(n: i32, macro_1: i32) -> i32 {
        return (n + macro_1);
      }"
    `);
  });

  it('throws when struct prop has whitespace in name', () => {
    const TestStruct = d.struct({ 'my prop': d.f32 });
    const main = tgpu.fn([])(() => {
      const instance = TestStruct();
    });

    expect(() => asWgsl(main))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:main
        - struct:TestStruct: Invalid identifier 'my prop'. Choose an identifier without whitespaces or leading underscores.]
      `);
  });

  it('throws when struct prop uses a reserved word', () => {
    const TestStruct = d.struct({ struct: d.f32 });
    const main = tgpu.fn([])(() => {
      const instance = TestStruct();
    });

    expect(() => asWgsl(main))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:main
        - struct:TestStruct: Property key 'struct' is a reserved WGSL word. Choose a different name.]
      `);
  });

  it('throws when an identifier starts with underscores', () => {
    const main1 = tgpu.fn([])(() => {
      const _ = 1;
    });

    const main2 = tgpu.fn([])(() => {
      const __my_var = 1;
    });

    expect(() => asWgsl(main1))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:main1: Invalid identifier '_'. Choose an identifier without whitespaces or leading underscores.]
      `);
    expect(() => asWgsl(main2))
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

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main() {
        var mut_1 = 1;
        var mut_1_1 = 2;
        var mut_1_2 = 2;
      }"
    `);
  });

  it('does not cause identifier clashes when renaming parameters', () => {
    const main = tgpu.fn([d.u32, d.u32])((extern, extern_1) => {
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
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

    expect(asWgsl(power)).toMatchInlineSnapshot(`
      "fn power() {
        var a = 10f;
        var b = 3f;
        var n = pow(a, b);
      }"
    `);
  });

  it('calculates pow at comptime when possible', () => {
    const four = 4;
    const power = tgpu.fn([])(() => {
      const n = 2 ** four;
    });

    expect(asWgsl(power)).toMatchInlineSnapshot(`
      "fn power() {
        var n = 16.;
      }"
    `);
  });

  it('casts in pow expression when necessary', () => {
    const power = tgpu.fn([])(() => {
      const a = d.u32(3);
      const b = d.i32(5);
      const m = a ** b;
    });

    expect(asWgsl(power)).toMatchInlineSnapshot(`
      "fn power() {
        var a = 3u;
        var b = 5i;
        var m = pow(f32(a), f32(b));
      }"
    `);
  });

  it('throws error when accessing matrix elements directly', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const element = matrix[4];
    });

    expect(() => asWgsl(testFn))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:testFn: The only way of accessing matrix elements in TGSL is through the 'columns' property.]
      `);
  });

  it('generates correct code when accessing matrix elements through .columns', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const column = matrix.columns[1];
      const element = column[0];
      const directElement = matrix.columns[1][0];
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "fn testFn() {
        var matrix = mat4x4f();
        var column = matrix[1];
        var element = column[0];
        var directElement = matrix[1][0];
      }"
    `);
  });

  it('resolves when accessing matrix elements through .columns', () => {
    const matrix = tgpu.workgroupVar(d.mat4x4f);
    const index = tgpu.workgroupVar(d.u32);

    const testFn = tgpu.fn([])(() => {
      const element = matrix.$.columns[index.$];
    });

    expect(asWgsl(testFn)).toMatchInlineSnapshot(`
      "var<workgroup> index: u32;

      var<workgroup> matrix: mat4x4f;

      fn testFn() {
        var element = matrix[index];
      }"
    `);
  });
});

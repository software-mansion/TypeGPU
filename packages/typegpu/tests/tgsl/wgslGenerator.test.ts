import * as tinyest from 'tinyest';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { snip } from '../../src/data/dataTypes.ts';
import * as d from '../../src/data/index.ts';
import { abstractFloat, abstractInt } from '../../src/data/numeric.ts';
import { Void } from '../../src/data/wgslTypes.ts';
import * as gpu from '../../src/gpuMode.ts';
import tgpu, { StrictNameRegistry } from '../../src/index.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { getMetaData } from '../../src/shared/meta.ts';
import { $internal } from '../../src/shared/symbols.ts';
import * as std from '../../src/std/index.ts';
import * as wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { it } from '../utils/extendedIt.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

const { NodeTypeCatalog: NODE } = tinyest;

const numberSlot = tgpu.slot(44);
const derivedV4u = tgpu['~unstable'].derived(() =>
  std.mul(d.u32(numberSlot.value), d.vec4u(1, 2, 3, 4))
);
const derivedV2f = tgpu['~unstable'].derived(() =>
  std.mul(d.f32(numberSlot.value), d.vec2f(1, 2))
);

const createContext = () => {
  return new ResolutionCtxImpl({
    names: new StrictNameRegistry(),
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
    const main = () => {
      'kernel';
      return true;
    };

    const parsedBody = getMetaData(main)?.ast?.body as tinyest.Block;

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[0,[[10,true]]]"`,
    );

    const gen = wgslGenerator.generateFunction(ctx, parsedBody);

    expect(parse(gen)).toBe(parse('{return true;}'));
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

    const gen = wgslGenerator.generateFunction(ctx, parsedBody);

    expect(parse(gen)).toBe(parse('{var a = 12;a += 21;return a;}'));
  });

  it('creates correct resources for numeric literals', () => {
    const literals = {
      intLiteral: { value: '12', wgsl: '12', dataType: abstractInt },
      floatLiteral: { value: '12.5', wgsl: '12.5', dataType: abstractFloat },
      scientificLiteral: {
        value: '12e10',
        wgsl: '12e10',
        dataType: abstractFloat,
      },
      scientificNegativeExponentLiteral: {
        value: '12e-4',
        wgsl: '12e-4',
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

    for (const stmt of (parsedBody as tinyest.Block)[1]) {
      const letStatement = stmt as tinyest.Let;
      const [_, name, numLiteral] = letStatement;
      const generatedExpr = wgslGenerator.generateExpression(
        ctx,
        numLiteral as tinyest.Num,
      );
      const expected = literals[name as keyof typeof literals];

      expect(generatedExpr.dataType).toStrictEqual(expected.dataType);
    }
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

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                   ^ this should be a u32
    const res1 = wgslGenerator.generateExpression(
      ctx,
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
    const res2 = wgslGenerator.generateExpression(
      ctx,
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
    const sum = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );
    expect(sum.dataType).toStrictEqual(d.u32);
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

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: return testUsage.value[3];
    //                   ^ this should be a u32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.u32);
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

    ctx[$internal].itemStateStack.pushFunctionScope(
      args,
      {},
      d.vec4f,
      astInfo.externals ?? {},
    );

    // Check for: const value = std.atomicLoad(testUsage.value.b.aa[idx]!.y);
    //                           ^ this part should be a i32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Const)[2],
    );

    expect(res.dataType).toStrictEqual(d.i32);

    // Check for: const vec = std.mix(d.vec4f(), testUsage.value.a, value);
    //                        ^ this part should be a vec4f
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'value', d.i32);
    const res2 = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][1] as tinyest.Const)[2],
    );
    ctx[$internal].itemStateStack.popBlockScope();

    expect(res2.dataType).toStrictEqual(d.vec4f);

    // Check for: std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
    //                            ^ this part should be an atomic u32
    //            ^ this part should be void
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'vec', d.vec4f);
    const res3 = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][2] as tinyest.Call)[2][0] as tinyest.Expression,
    );
    const res4 = wgslGenerator.generateExpression(
      ctx,
      astInfo.ast?.body[1][2] as tinyest.Expression,
    );
    ctx[$internal].itemStateStack.popBlockScope();

    expect(res3.dataType).toStrictEqual(d.atomic(d.u32));
    expect(res4.dataType).toStrictEqual(Void);
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

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toBe(
      parse('{for(var i = 0;(i < 10);i += 1){continue;}}'),
    );
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

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toBe(
      parse('{var i = 0;for(;(i < 10);i += 1){continue;}}'),
    );
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

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toBe(parse('{var i = 0;while((i < 10)){i += 1;}}'));
  });

  it('creates correct resources for derived values and slots', () => {
    const testFn = tgpu.fn([], d.vec4u)(() => {
      return derivedV4u.value;
    });

    expect(parseResolved({ testFn })).toBe(
      parse(`
      fn testFn() -> vec4u {
        return vec4u(44, 88, 132, 176);
      }`),
    );

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[7,"derivedV4u","value"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.vec4u,
      astInfo.externals ?? {},
    );

    // Check for: return derivedV4u.value;
    //                      ^ this should be a vec4u
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.vec4u);
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

    ctx[$internal].itemStateStack.pushFunctionScope(
      [snip('idx', d.u32)],
      {},
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return derivedV2f.value[idx];
    //                      ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.f32);
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      const arr = [d.u32(1), 2, 3];
      return arr[1] as number;
    });

    expect(parseResolved({ testFn })).toBe(
      parse(`
      fn testFn() -> u32 {
        var arr = array<u32, 3>(u32(1), 2, 3);
        return arr[1];
      }`),
    );

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[6,[7,"d","u32"],[[5,"1"]]],[5,"2"],[5,"3"]]]],[10,[8,"arr",[5,"1"]]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: const arr = [1, 2, 3]
    //                        ^ this should be an array<u32, 3>
    const res = wgslGenerator.generateExpression(
      ctx,
      // deno-fmt-ignore: it's better that way
      (
        astInfo.ast?.body[1][0] as tinyest.Const
      )[2] as unknown as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.arrayOf(d.u32, 3));
  });

  it('generates correct code for complex array expressions', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      const arr = [
        d.vec2u(1, 2),
        d.vec2u(3, 4),
        std.min(d.vec2u(5, 6), d.vec2u(7, 8)),
      ] as [d.v2u, d.v2u, d.v2u];
      return arr[1].x;
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() -> u32 {
        var arr = array<vec2u, 3>(vec2u(1, 2), vec2u(3, 4), min(vec2u(5, 6), vec2u(7, 8)));
        return arr[1].x;
      }`),
    );
  });

  it('does not autocast lhs of an assignment', () => {
    const testFn = tgpu.fn([], d.u32)(() => {
      let a = d.u32(12);
      const b = d.f32(2.5);
      a = b;

      return a;
    });

    expect(parseResolved({ testFn })).toBe(
      parse(`
      fn testFn() -> u32 {
        var a = u32(12);
        var b = f32(2.5);
        a = u32(b);
        return a;
      }`),
    );
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

    expect(parseResolved({ testFn })).toBe(
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

    const astInfo = getMetaData(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[13,"arr",[100,[[6,"TestStruct",[[104,{"x":[5,"1"],"y":[5,"2"]}]]],[6,"TestStruct",[[104,{"x":[5,"3"],"y":[5,"4"]}]]]]]],[10,[7,[8,"arr",[5,"1"]],"y"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: const arr = [TestStruct({ x: 1, y: 2 }), TestStruct({ x: 3, y: 4 })];
    //                        ^ this should be an array<TestStruct, 2>
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Const)[2] as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.arrayOf(TestStruct, 2));
  });

  it('generates correct code for array expressions with derived elements', () => {
    const testFn = tgpu.fn([], d.f32)(() => {
      const arr = [derivedV2f.$, std.mul(derivedV2f.$, d.vec2f(2, 2))];
      return (arr[1] as { x: number; y: number }).y;
    });

    expect(parseResolved({ testFn })).toBe(
      parse(`
      fn testFn() -> f32 {
        var arr = array<vec2f, 2>(vec2f(44, 88), (vec2f(44, 88) * vec2f(2, 2)));
        return arr[1].y;
      }`),
    );

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

    expect(parseResolved({ fnTwo })).toBe(
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

    const astInfo = getMetaData(
      fnTwo[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast?.body)).toMatchInlineSnapshot(
      `"[0,[[10,[7,[7,[6,"fnOne",[]],"y"],"x"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return fnOne().y.x;
    //                   ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast?.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toStrictEqual(d.f32);
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

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      {},
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: const value = testSlot.value.value;
    //                  ^ this should be a vec3f
    const res = wgslGenerator.generateExpression(
      ctx,
      (
        astInfo.ast?.body[1][0] as tinyest.Const
      )[2] as unknown as tinyest.Expression,
    );

    expect(res.dataType).toEqual(d.vec3f);
  });

  it('generates correct code for conditionals with single statements', () => {
    const main0 = () => {
      'kernel';
      // biome-ignore lint/correctness/noConstantCondition: sshhhh, it's just a test
      if (true) return 0;
      return 1;
    };

    expect(
      parse(
        wgslGenerator.generateFunction(
          ctx,
          getMetaData(main0)?.ast?.body as tinyest.Block,
        ),
      ),
    ).toBe(
      parse(`{
      if (true) {
        return 0;
      }
      return 1;
    }`),
    );

    const main1 = () => {
      'kernel';
      let y = 0;
      // biome-ignore lint/correctness/noConstantCondition: sshhhh, it's just a test
      if (true) y = 1;
      else y = 2;
      return y;
    };

    expect(
      parse(
        wgslGenerator.generateFunction(
          ctx,
          getMetaData(main1)?.ast?.body as tinyest.Block,
        ),
      ),
    ).toBe(
      parse(`{
      var y = 0;
      if (true) {
        y = 1;
      } else {
       y = 2;
      }
      return y;
    }`),
    );

    const main2 = () => {
      'kernel';
      let y = 0;
      // biome-ignore lint/correctness/noConstantCondition: sshhhh, it's just a test
      if (true) {
        y = 1;
      } else y = 2;
      return y;
    };

    expect(
      parse(
        wgslGenerator.generateFunction(
          ctx,
          getMetaData(main2)?.ast?.body as tinyest.Block,
        ),
      ),
    ).toBe(
      parse(`{
      var y = 0;
      if (true) {
        y = 1;
      } else {
       y = 2;
      }
      return y;
    }`),
    );
  });

  it('generates correct code for for loops with single statements', () => {
    const main = () => {
      'kernel';
      // biome-ignore lint/correctness/noUnnecessaryContinue: sshhhh, it's just a test
      for (let i = 0; i < 10; i += 1) continue;
    };

    expect(
      parse(
        wgslGenerator.generateFunction(
          ctx,
          getMetaData(main)?.ast?.body as tinyest.Block,
        ),
      ),
    ).toBe(parse('{for(var i = 0;(i < 10);i += 1){continue;}}'));
  });

  it('generates correct code for while loops with single statements', () => {
    const main = () => {
      'kernel';
      let i = 0;
      while (i < 10) i += 1;
    };

    expect(
      parse(
        wgslGenerator.generateFunction(
          ctx,
          getMetaData(main)?.ast?.body as tinyest.Block,
        ),
      ),
    ).toBe(parse('{var i = 0;while((i < 10)){i += 1;}}'));
  });

  it('throws error when incorrectly initializing function', () => {
    const internalTestFn = tgpu.fn([d.vec2f], d.mat4x4f)(() => {
      return d.mat4x4f();
    });

    const testFn = tgpu.fn([])(() => {
      // @ts-expect-error
      return internalTestFn([1, 23, 3]);
    });

    expect(() => parseResolved({ cleantestFn: testFn }))
      .toThrowErrorMatchingInlineSnapshot(`
[Error: Resolution of the following tree failed: 
- <root>
- fn:testFn
- internalTestFn: Resolution of the following tree failed: 
- internalTestFn: Cannot convert argument of type 'array' to 'vec2f' for function internalTestFn]
`);
  });

  it('throws error when initializing translate4 function', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      return std.translate4();
    });

    expect(() => parseResolved({ testFn })).toThrowErrorMatchingInlineSnapshot(`
[Error: Resolution of the following tree failed: 
- <root>
- fn:testFn
- translate4: Cannot read properties of undefined (reading 'value')]
`);
  });

  it('throws error when initializing vec4f with an array', () => {
    const testFn = tgpu.fn([], d.mat4x4f)(() => {
      // @ts-expect-error
      const x = d.vec4f([1, 2, 3, 4]);
      return d.mat4x4f();
    });

    expect(() => parseResolved({ testFn })).toThrowErrorMatchingInlineSnapshot(`
[Error: Resolution of the following tree failed: 
- <root>
- fn:testFn
- vec4f: Resolution of the following tree failed: 
- vec4f: Cannot convert argument of type 'array' to 'f32' for function vec4f]
`);
  });
});

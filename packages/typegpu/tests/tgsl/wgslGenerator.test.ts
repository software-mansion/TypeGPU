import { JitTranspiler } from 'tgpu-jit';
import * as tinyest from 'tinyest';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { getPrebuiltAstFor } from '../../src/core/function/astUtils.ts';
import * as d from '../../src/data/index.ts';
import { abstractFloat, abstractInt } from '../../src/data/numeric.ts';
import { Void } from '../../src/data/wgslTypes.ts';
import * as gpu from '../../src/gpuMode.ts';
import tgpu, { StrictNameRegistry } from '../../src/index.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { $internal } from '../../src/shared/symbols.ts';
import * as std from '../../src/std/index.ts';
import * as wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { it } from '../utils/extendedIt.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

const { NodeTypeCatalog: NODE } = tinyest;

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

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[3,[[1,true]]]"`,
    );

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

    expect(JSON.stringify(parsedBody)).toMatchInlineSnapshot(
      `"[3,[[4,"a",[21,"12"]],[11,"a","+=",[21,"21"]],[1,"a"]]]"`,
    );

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

    expect(parsedBody).toEqual([
      NODE.block,
      Object.entries(literals).map(([key, { value }]) => [
        NODE.let,
        key,
        [NODE.numeric_literal, value],
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
      .fn(
        [],
        d.u32,
      )(() => {
        return testUsage.value.a + testUsage.value.b.x;
      })
      .$name('testFn');

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );
    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[1,[10,[16,[16,"testUsage","value"],"a"],"+",[16,[16,[16,"testUsage","value"],"b"],"x"]]]]]"`,
    );
    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                   ^ this should be a u32
    const res1 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <it's better that way>
      ((astInfo.ast.body[1][0] as tinyest.Return)[1] as tinyest.BinaryExpression)[1],
    );

    expect(res1.dataType).toEqual(d.u32);

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                                            ^ this should be a u32
    const res2 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <it's better that way>
      (((astInfo.ast.body)[1][0] as tinyest.Return)[1] as tinyest.BinaryExpression)[3],
    );
    expect(res2.dataType).toEqual(d.u32);

    // Check for: return testUsage.value.a + testUsage.value.b.x;
    //                   ^ this should be a u32
    const sum = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
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

    const testFn = tgpu['~unstable'].fn(
      [],
      d.u32,
    )(() => {
      return testUsage.value[3] as number;
    });

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[1,[17,[16,"testUsage","value"],[21,"3"]]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: return testUsage.value[3];
    //                   ^ this should be a u32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
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
      .fn(
        [d.u32],
        d.vec4f,
      )((idx) => {
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[5,"value",[18,[16,"std","atomicLoad"],[[16,[17,[16,[16,[16,"testUsage","value"],"b"],"aa"],"idx"],"y"]]]],[5,"vec",[18,[16,"std","mix"],[[18,[16,"d","vec4f"],[]],[16,[16,"testUsage","value"],"a"],"value"]]],[18,[16,"std","atomicStore"],[[16,[17,[16,[16,[16,"testUsage","value"],"b"],"aa"],"idx"],"x"],[16,"vec","y"]]],[1,"vec"]]]"`,
    );

    if (astInfo.ast.argNames.type !== 'identifiers') {
      throw new Error('Expected arguments as identifier names in ast');
    }

    const args = astInfo.ast.argNames.names.map((name) => ({
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
      // biome-ignore format: <good luck with this formatted>
      ((astInfo.ast.body)[1][0] as tinyest.Const)[2],
    );

    expect(res.dataType).toEqual(d.i32);

    // Check for: const vec = std.mix(d.vec4f(), testUsage.value.a, value);
    //                        ^ this part should be a vec4f
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'value', d.i32);
    const res2 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <good luck with this formatted>
      ((astInfo.ast.body)[1][1] as tinyest.Const)[2],
    );
    ctx[$internal].itemStateStack.popBlockScope();

    expect(res2.dataType).toEqual(d.vec4f);

    // Check for: std.atomicStore(testUsage.value.b.aa[idx]!.x, vec.y);
    //                            ^ this part should be an atomic u32
    //            ^ this part should be void
    ctx[$internal].itemStateStack.pushBlockScope();
    wgslGenerator.registerBlockVariable(ctx, 'vec', d.vec4f);
    const res3 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <good luck with this formatted>
      ((astInfo.ast.body)[1][2] as tinyest.Call)[2][0] as tinyest.Expression,
    );
    const res4 = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <good luck with this formatted>
      (astInfo.ast.body)[1][2] as tinyest.Expression,
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

    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[3,[[6,[4,"i",[21,"0"]],[10,"i","<",[21,"10"]],[11,"i","+=",[21,"1"]],[3,[[8]]]]]]"`,
    );

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

    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[3,[[4,"i",[21,"0"]],[6,null,[10,"i","<",[21,"10"]],[11,"i","+=",[21,"1"]],[3,[[8]]]]]]"`,
    );

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

    expect(JSON.stringify(parsed)).toMatchInlineSnapshot(
      `"[3,[[4,"i",[21,"0"]],[7,[10,"i","<",[21,"10"]],[3,[[11,"i","+=",[21,"1"]]]]]]]"`,
    );

    const gen = wgslGenerator.generateFunction(ctx, parsed);

    expect(parse(gen)).toEqual(parse('{var i = 0;while((i < 10)){i += 1;}}'));
  });

  it('creates correct resources for derived values and slots', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.u32(numberSlot.value), d.vec4u(1, 2, 3, 4)),
    );

    const testFn = tgpu['~unstable']
      .fn(
        [],
        d.vec4u,
      )(() => {
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[1,[16,"derived","value"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.vec4u,
      astInfo.externals ?? {},
    );

    // Check for: return derived.value;
    //                      ^ this should be a vec4u
    const res = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <it's better that way>
      ((astInfo.ast.body)[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toEqual(d.vec4u);
  });

  it('creates correct resources for indexing into a derived value', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.f32(numberSlot.value), d.vec2f(1, 2)),
    );

    const testFn = tgpu['~unstable']
      .fn(
        [d.u32],
        d.f32,
      )((idx) => {
        return derived.value[idx] as number;
      })
      .$name('testFn');

    const astInfo = getPrebuiltAstFor(
      testFn[$internal].implementation as (...args: unknown[]) => unknown,
    );

    if (!astInfo) {
      throw new Error('Expected prebuilt AST to be present');
    }

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[1,[17,[16,"derived","value"],"idx"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [{ value: 'idx', dataType: d.u32 }],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return derived.value[idx];
    //                      ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toEqual(d.f32);
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu['~unstable'].fn(
      [],
      d.u32,
    )(() => {
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[5,"arr",[15,[[21,"1"],[21,"2"],[21,"3"]]]],[1,[17,"arr",[21,"1"]]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.u32,
      astInfo.externals ?? {},
    );

    // Check for: const arr = [1, 2, 3]
    //                        ^ this should be an array<u32, 3>
    const res = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <it's better that way>
      ((astInfo.ast.body)[1][0] as tinyest.Const)[2] as unknown as tinyest.Expression,
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

    const testFn = tgpu['~unstable'].fn(
      [],
      d.f32,
    )(() => {
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(`"[3,[[5,"arr",[15,[[18,"testStruct",[[14,{"x":[21,"1"],"y":[21,"2"]}]]],[18,"testStruct",[[14,{"x":[21,"3"],"y":[21,"4"]}]]]]]],[1,[16,[17,"arr",[21,"1"]],"y"]]]]"`);

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: const arr = [testStruct({ x: 1, y: 2 }), testStruct({ x: 3, y: 4 })];
    //                        ^ this should be an array<TestStruct, 2>
    const res = wgslGenerator.generateExpression(
      ctx,
      (astInfo.ast.body[1][0] as tinyest.Const)[2] as tinyest.Expression,
    );

    expect(res.dataType).toEqual(d.arrayOf(testStruct, 2));
  });

  it('generates correct code for array expressions with derived elements', () => {
    const numberSlot = tgpu['~unstable'].slot(44);
    const derived = tgpu['~unstable'].derived(() =>
      std.mul(d.f32(numberSlot.value), d.vec2f(1, 2)),
    );

    const testFn = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[5,"arr",[15,[[16,"derived","value"],[18,[16,"std","mul"],[[16,"derived","value"],[18,[16,"d","vec2f"],[[21,"2"],[21,"2"]]]]]]]],[1,[16,[17,"arr",[21,"1"]],"y"]]]]"`,
    );
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

    expect(JSON.stringify(astInfo.ast.body)).toMatchInlineSnapshot(
      `"[3,[[1,[16,[16,[18,"fnOne",[]],"y"],"x"]]]]"`,
    );

    ctx[$internal].itemStateStack.pushFunctionScope(
      [],
      d.f32,
      astInfo.externals ?? {},
    );

    // Check for: return fnOne().y.x;
    //                   ^ this should be a f32
    const res = wgslGenerator.generateExpression(
      ctx,
      // biome-ignore format: <it's better that way>
      ((astInfo.ast.body)[1][0] as tinyest.Return)[1] as tinyest.Expression,
    );

    expect(res.dataType).toEqual(d.f32);
  });
});

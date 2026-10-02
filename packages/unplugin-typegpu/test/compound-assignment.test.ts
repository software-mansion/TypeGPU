import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';
import { unpluginFactory } from '../src/core/factory.ts';

/** Runs the unplugin transform directly, without a bundler reformatting the result. */
function rawTransform(source: string): string {
  const plugin = unpluginFactory({ autoNamingEnabled: false }, {} as never);
  const handler = plugin.transform.handler as (code: string, id: string) => { code: string };
  return handler.call({ warn() {} }, source, 'test.ts').code;
}

const code = `\
  const arr = [1, 2, 3];
  const obj = { inner: { value: 5 } };
  const state = { calls: 0 };
  const next = () => { state.calls++; return 1; };
  const getInner = () => { state.calls++; return obj.inner; };

  const run = () => {
    'use gpu';
    arr[next()] += 10
    getInner().value *= 2;
    obj.inner.value -= 1;
    arr[0] += 1;
  };

  run();
  globalThis.__compoundResult = [arr, obj.inner.value, state.calls];
`;

/**
 * Runs the transformed code with operator overloads that behave like
 * the built-in operators.
 */
function execute(transformed: string) {
  const g = globalThis as Record<string, unknown>;
  g.__tsover_add = (a: number, b: number) => a + b;
  g.__tsover_sub = (a: number, b: number) => a - b;
  g.__tsover_mul = (a: number, b: number) => a * b;
  try {
    new Function(transformed)();
    return g.__compoundResult;
  } finally {
    delete g.__tsover_add;
    delete g.__tsover_sub;
    delete g.__tsover_mul;
    delete g.__compoundResult;
  }
}

describe('compound assignments in "use gpu" functions', () => {
  test('babel evaluates the left-hand side only once', () => {
    const transformed = babelTransform(code) ?? '';
    // 2 calls: one for next(), one for getInner()
    expect(execute(transformed)).toStrictEqual([[2, 12, 3], 9, 2]);
  });

  test('rollup evaluates the left-hand side only once', async () => {
    const transformed = await rollupTransform(code);
    expect(execute(transformed)).toStrictEqual([[2, 12, 3], 9, 2]);
  });

  test('babel keeps simple left-hand sides as they were', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const arr = [1, 2, 3];
      const obj = {
        inner: {
          value: 5
        }
      };
      const state = {
        calls: 0
      };
      const next = () => {
        state.calls++;
        return 1;
      };
      const getInner = () => {
        state.calls++;
        return obj.inner;
      };
      const run = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';

        ((__tsover_o, __tsover_k) => __tsover_o[__tsover_k] = __tsover_add(__tsover_o[__tsover_k], 10))(arr, next());
        (__tsover_o => __tsover_o.value = __tsover_mul(__tsover_o.value, 2))(getInner());
        obj.inner.value = __tsover_sub(obj.inner.value, 1);
        arr[0] = __tsover_add(arr[0], 1);
      }, {
        v: 2,
        name: "run",
        ast: {
          params: [],
          body: [0, [[2, [8, "arr", [6, "next", []]], "+=", [5, "10"]], [2, [7, [6, "getInner", []], "value"], "*=", [5, "2"]], [2, "obj.inner.value", "-=", [5, "1"]], [2, [8, "arr", [5, "0"]], "+=", [5, "1"]]]]
        },
        externals: {
          "arr": () => arr,
          "next": () => next,
          "getInner": () => getInner,
          "obj.inner.value": () => obj.inner.value
        }
      }) && $.f)({});
      run();
      globalThis.__compoundResult = [arr, obj.inner.value, state.calls];"
    `);
  });

  test('rollup keeps simple left-hand sides as they were', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const arr = [1, 2, 3];
        const obj = { inner: { value: 5 } };
        const state = { calls: 0 };
        const next = () => { state.calls++; return 1; };
        const getInner = () => { state.calls++; return obj.inner; };

        const run = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
          'use gpu';
          ((__tsover_o, __tsover_k) => __tsover_o[__tsover_k] = __tsover_add(__tsover_o[__tsover_k], 10))(arr, next());
          ((__tsover_o) => __tsover_o.value = __tsover_mul(__tsover_o.value, 2))(getInner());
          obj.inner.value = __tsover_sub(obj.inner.value, 1);
          arr[0] = __tsover_add(arr[0], 1);
        }), {
          v: 2,
          name: "run",
          ast: {"params":[],"body":[0,[[2,[8,"arr",[6,"next",[]]],"+=",[5,"10"]],[2,[7,[6,"getInner",[]],"value"],"*=",[5,"2"]],[2,"obj.inner.value","-=",[5,"1"]],[2,[8,"arr",[5,"0"]],"+=",[5,"1"]]]]},
          externals: {"arr":() => arr,"next":() => next,"getInner":() => getInner,"obj.inner.value":() => obj.inner.value}
        }) && $.f)({}));

        run();
        globalThis.__compoundResult = [arr, obj.inner.value, state.calls];
      "
    `);
  });

  test('does not continue the previous line when it lacks a semicolon', () => {
    const asiCode = `\
      const arr = [1, 2, 3];
      const obj = { inner: { value: 5 } };
      const state = { calls: 0 };
      const next = () => { state.calls++; return 1; };

      const run = () => {
        'use gpu';
        obj.inner.value *= 2
        arr[next()] += 10
      };

      run();
      globalThis.__compoundResult = [arr, obj.inner.value, state.calls];
    `;

    const transformed = rawTransform(asiCode);
    expect(transformed).toContain('void 0, ((__tsover_o, __tsover_k) =>');
    expect(execute(transformed)).toStrictEqual([[1, 12, 3], 10, 1]);
  });
});

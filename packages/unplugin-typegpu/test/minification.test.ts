import { expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';
import { describe } from 'node:test';

// No need to test the minification in-depth, as it is already tested in tinyest-for-wgsl.
describe('minification', () => {
  describe('assigns minified metadata', () => {
    const code = `\
      import { tgpu } from 'typegpu';

      const external = { n: 1 }

      export const fn = (argument) => {
        'use gpu';
        const variable = 3;
        return external.n + argument + variable;
      };`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { minify: true })).toMatchInlineSnapshot(`
    "import { tgpu } from 'typegpu';
    const external = {
      n: 1
    };
    export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = argument => {
      const variable = 3;
      return __tsover_add(__tsover_add(external.n, argument), variable);
    }, {
      v: 2,
      name: "fn",
      ast: {
        params: [{
          type: "i",
          name: "a"
        }],
        body: [0, [[13, "b", [5, "3"]], [10, [1, [1, "c", "+", "a"], "+", "b"]]]]
      },
      externals: {
        "c": () => external.n
      }
    }) && $.f)({});"
  `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { minify: true })).toMatchInlineSnapshot(`
        "import 'typegpu';

        const external = { n: 1 };

              const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                
                const variable = 3;
                return __tsover_add(__tsover_add(external.n, argument), variable);
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[{"type":"i","name":"a"}],"body":[0,[[13,"b",[5,"3"]],[10,[1,[1,"c","+","a"],"+","b"]]]]},
            externals: {"c":() => external.n}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('weird identifiers', () => {
    const code = `
      import { tgpu } from 'typegpu';

      export const fn = () => {
        'use gpu';
        const a = undefined;
        const b = Infinity;
        const c = NaN;
      }`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { minify: true })).toMatchInlineSnapshot(`
    "import { tgpu } from 'typegpu';
    export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
      const a = undefined;
      const b = Infinity;
      const c = NaN;
    }, {
      v: 2,
      name: "fn",
      ast: {
        params: [],
        body: [0, [[13, "a", "b"], [13, "c", "d"], [13, "e", "f"]]]
      },
      externals: {
        "b": () => undefined,
        "d": () => Infinity,
        "f": () => NaN
      }
    }) && $.f)({});"
  `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { minify: true })).toMatchInlineSnapshot(`
        "import 'typegpu';

        const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[],"body":[0,[[13,"a","b"],[13,"c","d"],[13,"e","f"]]]},
            externals: {"b":() => undefined,"d":() => Infinity,"f":() => NaN}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });
});

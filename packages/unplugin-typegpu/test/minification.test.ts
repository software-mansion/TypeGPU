import { expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

// No need to test the minification in-depth, as it is already tested in tinyest-for-wgsl.
const code = `\
import { tgpu } from 'typegpu';

const external = { n: 1 }

export const fn = (argument) => {
  'use gpu';
  const variable = 3;
  return external.n + argument + variable;
};
`;

test('[BABEL] assigns minified metadata', () => {
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

test('[ROLLUP] assigns minified metadata', async () => {
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

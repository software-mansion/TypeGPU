import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] parser options', () => {
  it('with no include option, import determines whether to run the plugin', () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(codeWithImport, { include: [/virtual:/] })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const increment = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));"
    `);

    const codeWithoutImport = `\
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(codeWithoutImport, { include: [/virtual:/] })).toMatchInlineSnapshot(`
      "const increment = tgpu.fn([])(() => {
        const x = 2 + 2;
      });"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', async () => {
  it('with no include option, import determines whether to run the plugin', async () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu.fn([])(() => {
      });

      console.log(increment);
  `;

    expect(await rollupTransform(codeWithImport, { include: [/virtual:/] })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const increment = tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

            console.log(increment);
      "
    `);

    const codeWithoutImport = `\
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });

      console.log(increment);
    `;

    expect(await rollupTransform(codeWithoutImport, { include: [/virtual:/] }))
      .toMatchInlineSnapshot(`
      "const increment = tgpu.fn([])(() => {
            });

            console.log(increment);
      "
    `);
  });
});

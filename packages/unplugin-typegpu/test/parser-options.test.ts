import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] parser options', () => {
  it('with no include option, import determines whether to run the plugin', () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(
      babelTransform(codeWithImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const increment = tgpu['~unstable'].fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
    `);

    const codeWithoutImport = `\
      const increment = tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(
      babelTransform(codeWithoutImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "const increment = tgpu['~unstable'].fn([])(() => {
        const x = 2 + 2;
      });"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', async () => {
  it('with no include option, import determines whether to run the plugin', async () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });

      console.log(increment);
  `;

    expect(
      await rollupTransform(codeWithImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const increment = $autoName(tgpu['~unstable']
              .fn([])((($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({})), increment);

            console.log(increment);
        
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
      "
    `);

    const codeWithoutImport = `\
      const increment = tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });

      console.log(increment);
    `;

    expect(
      await rollupTransform(codeWithoutImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "const increment = $autoName(tgpu['~unstable']
              .fn([])(() => {
                const x = $autoName(2+2, x);
              }), increment);

            console.log(increment);
          
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
      "
    `);
  });
});

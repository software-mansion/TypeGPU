import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform';

describe('[BABEL] parser options', () => {
  it('with no include option, import determines whether to run the plugin', () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(codeWithImport, {})).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const increment = tgpu['~unstable'].fn([]).does(tgpu.__assignAst(() => {
        const x = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);

    const codeWithoutImport = `\
      const increment = tgpu['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(codeWithoutImport, {})).toMatchInlineSnapshot(`
      "const increment = tgpu['~unstable'].fn([]).does(() => {
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
        .fn([])
        .does(() => {
          const x = 2+2;
        });

      console.log(increment);
  `;

    expect(await rollupTransform(codeWithImport, {})).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const increment = tgpu['~unstable']
              .fn([])
              .does(tgpu.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));

            console.log(increment);
      "
    `);

    const codeWithoutImport = `\
      const increment = tgpu['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });

      console.log(increment);
    `;

    expect(await rollupTransform(codeWithoutImport, {})).toMatchInlineSnapshot(`
      "const increment = tgpu['~unstable']
              .fn([])
              .does(() => {
              });

            console.log(increment);
      "
    `);
  });
});

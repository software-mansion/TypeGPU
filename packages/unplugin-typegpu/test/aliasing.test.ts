import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform';

describe('[BABEL] tgpu alias gathering', () => {
  it('works with default import named not tgpu', () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';
      const increment = hello['~unstable'].fn([]).does(hello.__assignAst(() => {
        const x = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });

  it('works when assigning tgpu to a constant', () => {
    const code = `\
      import tgpu from 'typegpu';
      const x = tgpu;
      
      const increment = x['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const x = tgpu;
      const increment = x['~unstable'].fn([]).does(tgpu.__assignAst(() => {
        const x = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });

  it('works with aliased tgpu import', () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu as t } from 'typegpu';
      const increment = t['~unstable'].fn([]).does(t.__assignAst(() => {
        const x = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });

  it('works with namespace import', () => {
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';
      const increment = t.tgpu['~unstable'].fn([]).does(t.tgpu.__assignAst(() => {
        const x = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';

      hello['~unstable']
              .fn([])
              .does(hello.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });

  it('works when assigning tgpu to a constant', async () => {
    const code = `\
      import tgpu from 'typegpu';
      const x = tgpu;
      
      const increment = x['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const x = tgpu;
            
            x['~unstable']
              .fn([])
              .does(tgpu.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    // aliasing removed by rollup, but technically it works
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      tgpu['~unstable']
              .fn([])
              .does(tgpu.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });

  it('works with namespace import', async () => {
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu['~unstable']
        .fn([])
        .does(() => {
          const x = 2+2;
        });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';

      t.tgpu['~unstable']
              .fn([])
              .does(t.tgpu.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });
});

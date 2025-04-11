import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] tgpu alias gathering', () => {
  it('works with default import named not tgpu', () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';
      const increment = hello['~unstable'].fn([])(hello.__assignAst(hello.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });

  // TODO: make it work
  // it('works when assigning tgpu to a constant', () => {
  //   const code = `\
  //     import tgpu from 'typegpu';
  //     const x = tgpu;

  //     const increment = x['~unstable']
  //       .fn([])
  //       (() => {
  //         const x = 2+2;
  //       });
  //   `;

  //   expect(babelTransform(code)).toMatchInlineSnapshot(`
  //     "import tgpu from 'typegpu';
  //     const x = tgpu;
  //     const increment = x['~unstable'].fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
  //   `);
  // });

  it('works with aliased tgpu import', () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu as t } from 'typegpu';
      const increment = t['~unstable'].fn([])(t.__assignAst(t.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });

  it('works with namespace import', () => {
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';
      const increment = t.tgpu['~unstable'].fn([])(t.tgpu.__assignAst(t.tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';

      hello['~unstable']
              .fn([])(hello.__assignAst(hello.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });

  // TODO: make it work
  // it('works when assigning tgpu to a constant', async () => {
  //   const code = `\
  //     import tgpu from 'typegpu';
  //     const x = tgpu;

  //     const increment = x['~unstable']
  //       .fn([])(() => {
  //         const x = 2+2;
  //       });
  //   `;

  //   expect(await rollupTransform(code)).toMatchInlineSnapshot(`
  //     "import tgpu from 'typegpu';

  //     const x = tgpu;

  //           x['~unstable']
  //             .fn([])
  //             (tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":[],"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
  //     "
  //   `);
  // });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    // aliasing removed by rollup, but technically it works
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      tgpu['~unstable']
              .fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });

  it('works with namespace import', async () => {
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu['~unstable']
        .fn([])(() => {
          const x = 2+2;
        });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';

      t.tgpu['~unstable']
              .fn([])(t.tgpu.__assignAst(t.tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":{"b":[{"c":["x",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));
      "
    `);
  });
});

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
      const increment = hello['~unstable'].fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
          ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
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
      const increment = t['~unstable'].fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
          ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
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
      const increment = t.tgpu['~unstable'].fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
          ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
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
              .fn([])(
                    (($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({}));
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
              .fn([])(
                    (($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({}));
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
              .fn([])(
                    (($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    ast: {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({}));
      "
    `);
  });
});

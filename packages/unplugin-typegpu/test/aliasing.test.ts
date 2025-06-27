import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] tgpu alias gathering', () => {
  it('works with default import named not tgpu', () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';
      const increment = hello.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
    `);
  });

  it('works with aliased tgpu import', () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu as t } from 'typegpu';
      const increment = t.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
    `);
  });

  it('works with namespace import', () => {
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';
      const increment = t.tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';
      
      const increment = hello.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';

      hello.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }), {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({})));
      "
    `);
  });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';
      
      const increment = t.fn([])(() => {
        const x = 2+2;
      });
    `;

    // aliasing removed by rollup, but technically it works
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }), {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({})));
      "
    `);
  });

  it('works with namespace import', async () => {
    // TODO: Oh ohh, this breaks for some reason :(
    const code = `\
      import * as t from 'typegpu';
      
      const increment = t.tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';

      t.tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }), {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({})));
      "
    `);
  });
});

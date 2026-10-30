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
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import hello from 'typegpu';
      const increment = hello.fn([])(/*#__PURE__*/__tgpu_meta(() => {
        const x = 2 + 2;
      }, "[[],[[13,\\"x\\",[1,2,\\"+\\",2]]]]", {}));"
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
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu as t } from 'typegpu';
      const increment = t.fn([])(/*#__PURE__*/__tgpu_meta(() => {
        const x = 2 + 2;
      }, "[[],[[13,\\"x\\",[1,2,\\"+\\",2]]]]", {}));"
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
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import * as t from 'typegpu';
      const increment = t.tgpu.fn([])(/*#__PURE__*/__tgpu_meta(() => {
        const x = 2 + 2;
      }, "[[],[[13,\\"x\\",[1,2,\\"+\\",2]]]]", {}));"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';

      const increment = hello.fn([])(() => {
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

            hello.fn([])((/*#__PURE__*/__tgpu_meta(() => {
            }, '[[],[]]', {})));
      "
    `);
  });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';

      const increment = t.fn([])(() => {
      });
    `;

    // aliasing removed by rollup, but technically it works
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

            tgpu.fn([])((/*#__PURE__*/__tgpu_meta(() => {
            }, '[[],[]]', {})));
      "
    `);
  });

  it('works with namespace import', async () => {
    // TODO: Oh ohh, this breaks for some reason :(
    const code = `\
      import * as t from 'typegpu';

      const increment = t.tgpu.fn([])(() => {
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

            t.tgpu.fn([])((/*#__PURE__*/__tgpu_meta(() => {
            }, '[[],[]]', {})));
      "
    `);
  });
});

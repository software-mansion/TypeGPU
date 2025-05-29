import { describe, expect, it } from 'vitest';
import { rollupTransform } from './transform';

describe('[ROLLUP] auto naming', () => {
  it('works with tgpu imports', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n));

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
            const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n));

            console.log(bindGroupLayout, vertexLayout);
      "
    `);
  });

  it(`works with tgpu['~unstable'] imports`, async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const accessor = tgpu['~unstable'].accessor(d.u32);
      const shell = tgpu['~unstable'].fn([]);
      const fn = tgpu['~unstable'].fn([])(() => {});
      const cst = tgpu['~unstable'].const(d.u32, 1);

      console.log(accessor, shell, fn, cst);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const accessor = tgpu['~unstable'].accessor(d.u32);
            const shell = tgpu['~unstable'].fn([]);
            const fn = tgpu['~unstable'].fn([])((($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({}));
            const cst = tgpu['~unstable'].const(d.u32, 1);

            console.log(accessor, shell, fn, cst);
      "
    `);
  });

  it(`works with structs`, async () => {
    const code = `\
      import * as d from 'typegpu/data';

      const myStruct = d.struct({ a: d.u32 });
      const bait = d.i32(1);

      console.log(myStruct, bait);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as d from 'typegpu/data';

      const myStruct = d.struct({ a: d.u32 });
            const bait = d.i32(1);

            console.log(myStruct, bait);
      "
    `);
  });

  it(`doesn't name what is already named`, async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)).$name(
        'myLayout',
      );
      const cst = tgpu['~unstable'].const(d.u32, 1).$name('myConst');
      const myStruct = d.struct({ a: d.u32 }).$name('myStruct');

      console.log(vertexLayout, cst, myStruct);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)).$name(
              'myLayout',
            );
            const cst = tgpu['~unstable'].const(d.u32, 1).$name('myConst');
            const myStruct = d.struct({ a: d.u32 }).$name('myStruct');

            console.log(vertexLayout, cst, myStruct);
      "
    `);
  });
});

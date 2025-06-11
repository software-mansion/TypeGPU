import { describe, expect, it } from 'vitest';
import { rollupTransform } from './transform.ts';

describe('[ROLLUP] auto naming', () => {
  it('works with tgpu items', async () => {
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

      const bindGroupLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout"));
            const vertexLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)), "vertexLayout"));

            console.log(bindGroupLayout, vertexLayout);
      "
    `);
  });

  it(`works with tgpu['~unstable'] items`, async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      let nothing, accessor = tgpu['~unstable'].accessor(d.u32);
      let shell = tgpu['~unstable'].fn([]);
      var fn = tgpu['~unstable'].fn([])(() => {});
      const cst = tgpu['~unstable'].const(d.u32, 1);

      console.log(accessor, shell, fn, cst);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      let accessor = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].accessor(d.u32), "accessor"));
            let shell = tgpu['~unstable'].fn([]);
            var fn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({}))), "fn"));
            const cst = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].const(d.u32, 1), "cst"));

            console.log(accessor, shell, fn, cst);
      "
    `);
  });

  it('works with structs', async () => {
    const code = `\
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const myStruct1 = d.struct({ a: d.u32 });
      const myStruct2 = struct({ a: u32 });
      const bait = d.i32(1);

      console.log(myStruct, bait);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "myStruct1"));
            ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(struct({ a: u32 }), "myStruct2"));
            const bait = d.i32(1);

            console.log(myStruct, bait);
      "
    `);
  });

  it('works with root items', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const root = await tgpu.init();
      const myBuffer = root.createBuffer(d.u32, 2);

      console.log(myBuffer);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const root = await tgpu.init();
            const myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer"));

            console.log(myBuffer);
      "
    `);
  });

  it('does not name already named items', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const root = await tgpu.init();
      const myBuffer = root.createBuffer(d.u32, 2).$name('int buffer');

      const myStruct = struct({ a: u32 }).$name('myStruct');

      console.log(myBuffer, myStruct)

    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const root = await tgpu.init();
            const myBuffer = root.createBuffer(d.u32, 2).$name('int buffer');

            const myStruct = struct({ a: u32 }).$name('myStruct');

            console.log(myBuffer, myStruct);
      "
    `);
  });

  it(`doesn't name non-tgpu stuff`, async () => {
    const code = `\
      const a = 1;
      const b = "root.createBuffer()";
      const c = () => {};

      console.log(a, b, c);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const a = 1;
            const b = "root.createBuffer()";
            const c = () => {};

            console.log(a, b, c);
      "
    `);
  });
});

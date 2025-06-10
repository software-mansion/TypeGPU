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

      const bindGroupLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu.bindGroupLayout({})), "bindGroupLayout");
            const vertexLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu.vertexLayout((n) => d.arrayOf(d.u32, n))), "vertexLayout");

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

      let accessor = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu['~unstable'].accessor(d.u32)), "accessor");
            let shell = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu['~unstable'].fn([])), "shell");
            var fn = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu['~unstable'].fn([])(((($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({})))), "fn");
            const cst = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu['~unstable'].const(d.u32, 1)), "cst");

            console.log(accessor, shell, fn, cst);
      "
    `);
  });

  // TODO: make it work
  // it(`works with structs`, async () => {
  //   const code = `\
  //     import * as d from 'typegpu/data';

  //     const myStruct = d.struct({ a: d.u32 });
  //     const bait = d.i32(1);

  //     console.log(myStruct, bait);
  //   `;

  //   expect(await rollupTransform(code)).toMatchInlineSnapshot(`
  //     "import * as d from 'typegpu/data';

  //     const myStruct = $autoName(d.struct({ a: d.u32 }), myStruct);
  //           const bait = $autoName(d.i32(1), bait);

  //           console.log(myStruct, bait);

  //     function $autoName(exp, label) {
  //       return exp?.$name ? exp.$name(label) : exp;
  //     }
  //     "
  //   `);
  // });

  // TODO: do we even want to support that ? make it work : delete the test
  // it(`works with directly imported structs`, async () => {
  //   const code = `\
  //     import { struct, u32 } from 'typegpu/data';

  //     const myStruct = struct({ a: u32 }).$name('myStruct');

  //     console.log(myStruct);
  //   `;

  //   expect(await rollupTransform(code)).toMatchInlineSnapshot(`
  //     "import { struct, u32 } from 'typegpu/data';

  //     const myStruct = $autoName(struct({ a: u32 }).$name('myStruct'), myStruct);

  //           console.log(myStruct);

  //     function $autoName(exp, label) {
  //       return exp?.$name ? exp.$name(label) : exp;
  //     }
  //     "
  //   `);
  // });

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

      const vertexLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)).$name(
              'myLayout',
            )), "vertexLayout");
            const cst = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((tgpu['~unstable'].const(d.u32, 1).$name('myConst')), "cst");
            const myStruct = (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((d.struct({ a: d.u32 }).$name('myStruct')), "myStruct");

            console.log(vertexLayout, cst, myStruct);
      "
    `);
  });

  it(`doesn't name non-tgpu stuff`, async () => {
    const code = `\
      const a = 1;
      const b = "tgpu";
      const c = () => {};
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "(globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((1), "a");
            (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))(("tgpu"), "b");
            (globalThis.__TYPEGPU_AUTONAME__ ?? ((a) => a))((() => {}), "c");
      "
    `);
  });
});

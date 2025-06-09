import { describe, expect, it } from 'vitest';
import { rollupTransform } from './transform';

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

      const bindGroupLayout = $autoName(tgpu.bindGroupLayout({}), bindGroupLayout);
            const vertexLayout = $autoName(tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)), vertexLayout);

            console.log(bindGroupLayout, vertexLayout);
          
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
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

      let accessor = $autoName(tgpu['~unstable'].accessor(d.u32), accessor);
            let shell = $autoName(tgpu['~unstable'].fn([]), shell);
            var fn = $autoName(tgpu['~unstable'].fn([])((($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                      $.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: {},
                  }) && $.f))({})), fn);
            const cst = $autoName(tgpu['~unstable'].const(d.u32, 1), cst);

            console.log(accessor, shell, fn, cst);
          
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
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

      const vertexLayout = $autoName(tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)).$name(
              'myLayout',
            ), vertexLayout);
            const cst = $autoName(tgpu['~unstable'].const(d.u32, 1).$name('myConst'), cst);
            const myStruct = $autoName(d.struct({ a: d.u32 }).$name('myStruct'), myStruct);

            console.log(vertexLayout, cst, myStruct);
          
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
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
      "const a = $autoName(1, a);
            const b = $autoName("tgpu", b);
            const c = $autoName(() => {}, c);
          
      function $autoName(exp, label) {
        return (exp?.$name && exp?.[globalThis.__TYPEGPU_META__?.$internal]) ? exp.$name(label) : exp;
      }
      "
    `);
  });
});

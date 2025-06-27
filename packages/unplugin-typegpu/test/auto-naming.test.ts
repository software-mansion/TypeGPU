import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] auto naming', () => {
  it('works with tgpu items', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n));
      var fn = tgpu.fn([])(() => {});
      let shell = tgpu.fn([]);

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const bindGroupLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout");
      const vertexLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout(n => d.arrayOf(d.u32, n)), "vertexLayout");
      var fn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "fn");
      let shell = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell");
      console.log(bindGroupLayout, vertexLayout);"
    `);
  });

  it(`works with tgpu['~unstable'] items`, () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      let nothing, accessor = tgpu['~unstable'].accessor(d.u32);
      const cst = tgpu['~unstable'].const(d.u32, 1);

      console.log(accessor, shell, fn, cst);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        let nothing,
          accessor = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].accessor(d.u32), "accessor");
        const cst = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].const(d.u32, 1), "cst");
        console.log(accessor, shell, fn, cst);"
      `);
  });

  it('works with structs', () => {
    const code = `\
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const myStruct1 = d.struct({ a: d.u32 });
      const myStruct2 = struct({ a: u32 });
      const bait = d.i32(1);

      console.log(myStruct1, myStruct2, bait);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';
      const myStruct1 = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
        a: d.u32
      }), "myStruct1");
      const myStruct2 = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(struct({
        a: u32
      }), "myStruct2");
      const bait = d.i32(1);
      console.log(myStruct1, myStruct2, bait);"
    `);
  });

  it('works with root items', () => {
    const code = `\
      import tgpu from 'typegpu';

      const root = await tgpu.init();
      const myBuffer = root.createBuffer(d.u32, 2);

      console.log(myBuffer);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const root = await tgpu.init();
      const myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer");
      console.log(myBuffer);"
    `);
  });

  it('works with functions', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
    
      const myFunction = tgpu.fn([])(() => 0);
      const myComputeFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );
      const myVertexFn = tgpu['~unstable'].vertexFn({ out: { ret: d.i32 } })(
        () => ({ ret: 0 }),
      );
      const myFragmentFn = tgpu['~unstable'].fragmentFn({
        in: { position: d.builtin.position },
        out: d.vec4f,
      })(
        () => d.vec4f(),
      );
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const myFunction = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "myFunction");
      const myComputeFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "myComputeFn");
      const myVertexFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].vertexFn({
        out: {
          ret: d.i32
        }
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "myVertexFn");
      const myFragmentFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fragmentFn({
        in: {
          position: d.builtin.position
        },
        out: d.vec4f
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[10,[6,[7,"d","vec4f"],[]]]]],"externalNames":["d"]},
          externals: {d},
        }) && $.f)({})), "myFragmentFn");"
    `);
  });

  it('works with nested calls', () => {
    const code = `
      const myBuffer = root.createBuffer(d.u32)
        .$usage('storage')
        .$addFlags(GPUBufferUsage.STORAGE);
      const Item = d.struct({ a: d.u32 });
      const myFn = tgpu.fn(
        [Item],
        Item,
      ) /* wgsl */\`(item: Item) -> Item { return item; }\`
        .$uses({ Item });
      const myLayout = tgpu
        .bindGroupLayout({ foo: { uniform: d.vec3f } })
        .$idx(0);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "const myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32).$usage('storage').$addFlags(GPUBufferUsage.STORAGE), "myBuffer");
        const Item = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
          a: d.u32
        }), "Item");
        const myFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([Item], Item) /* wgsl */\`(item: Item) -> Item { return item; }\`.$uses({
          Item
        }), "myFn");
        const myLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({
          foo: {
            uniform: d.vec3f
          }
        }).$idx(0), "myLayout");"
      `);
  });

  it('does not name already named items', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const root = await tgpu.init();
      const myBuffer = root.createBuffer(d.u32, 2).$name('int buffer');

      const myStruct = struct({ a: u32 }).$name('myStruct');

      console.log(myBuffer, myStruct)

    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';
      const root = await tgpu.init();
      const myBuffer = root.createBuffer(d.u32, 2).$name('int buffer');
      const myStruct = struct({
        a: u32
      }).$name('myStruct');
      console.log(myBuffer, myStruct);"
    `);
  });

  it(`doesn't name non-tgpu stuff`, () => {
    const code = `\
      const a = 1;
      const b = "root.createBuffer()";
      const c = () => {};

      console.log(a, b, c);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "const a = 1;
      const b = "root.createBuffer()";
      const c = () => {};
      console.log(a, b, c);"
    `);
  });
});

describe('[ROLLUP] auto naming', () => {
  it('works with tgpu items', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(d.u32, n));
      let shell = tgpu.fn([]);
      var fn = tgpu.fn([])(() => {});

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const bindGroupLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout"));
              const vertexLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout((n) => d.arrayOf(d.u32, n)), "vertexLayout"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                          throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                        }), {
                      v: 1,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: {},
                    }) && $.f)({}))), "fn"));

              console.log(bindGroupLayout, vertexLayout);
        "
      `);
  });

  it(`works with tgpu['~unstable'] items`, async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      let nothing, accessor = tgpu['~unstable'].accessor(d.u32);
      const cst = tgpu['~unstable'].const(d.u32, 1);

      console.log(accessor, shell, fn, cst);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        let accessor = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].accessor(d.u32), "accessor"));
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

      console.log(myStruct1, myStruct2, bait);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import * as d from 'typegpu/data';
        import { struct } from 'typegpu/data';

        const myStruct1 = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "myStruct1"));
              const myStruct2 = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(struct({ a: u32 }), "myStruct2"));
              const bait = d.i32(1);

              console.log(myStruct1, myStruct2, bait);
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

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';

        const root = await tgpu.init();
              const myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer"));

              console.log(myBuffer);
        "
      `);
  });

  it('works with functions', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
    
      const myFunction = tgpu.fn([])(() => 0);
      const myComputeFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
        () => {},
      );
      const myVertexFn = tgpu['~unstable'].vertexFn({ out: { ret: d.i32 } })(
        () => ({ ret: 0 }),
      );
      const myFragmentFn = tgpu['~unstable'].fragmentFn({
        in: { position: d.builtin.position },
        out: d.vec4f,
      })(
        () => d.vec4f(),
      );
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                          throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                        }), {
                      v: 1,
                      ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                      externals: {},
                    }) && $.f)({}))), "myFunction"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                          throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                        }), {
                      v: 1,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: {},
                    }) && $.f)({})),
              ), "myComputeFn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].vertexFn({ out: { ret: d.i32 } })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                          throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                        }), {
                      v: 1,
                      ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
                      externals: {},
                    }) && $.f)({})),
              ), "myVertexFn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fragmentFn({
                in: { position: d.builtin.position },
                out: d.vec4f,
              })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                          throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                        }), {
                      v: 1,
                      ast: {"params":[],"body":[0,[[10,[6,[7,"d","vec4f"],[]]]]],"externalNames":["d"]},
                      externals: {d},
                    }) && $.f)({})),
              ), "myFragmentFn"));
        "
      `);
  });

  it('works with nested calls', async () => {
    const code = `
      const myBuffer = root.createBuffer(d.u32)
        .$usage('storage')
        .$addFlags(GPUBufferUsage.STORAGE);
      const Item = d.struct({ a: d.u32 });
      const myFn = tgpu.fn(
        [Item],
        Item,
      ) /* wgsl */\`(item: Item) -> Item { return item; }\`
        .$uses({ Item });
      const myLayout = tgpu
        .bindGroupLayout({ foo: { uniform: d.vec3f } })
        .$idx(0);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32)
                .$usage('storage')
                .$addFlags(GPUBufferUsage.STORAGE), "myBuffer"));
              const Item = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "Item"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn(
                [Item],
                Item,
              ) /* wgsl */\`(item: Item) -> Item { return item; }\`
                .$uses({ Item }), "myFn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
                .bindGroupLayout({ foo: { uniform: d.vec3f } })
                .$idx(0), "myLayout"));
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

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
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

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
      "const a = 1;
            const b = "root.createBuffer()";
            const c = () => {};

            console.log(a, b, c);
      "
    `);
  });
});

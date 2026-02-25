import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform, webpackTransform } from './transform.ts';

describe('[BABEL] auto naming', () => {
  it('works with tgpu items', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32));
      var fn = tgpu.fn([])(() => {});
      let shell = tgpu.fn([]);
      const cst = tgpu.const(d.u32, 1);

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        const bindGroupLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout");
        const vertexLayout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout(d.arrayOf(d.u32)), "vertexLayout");
        var fn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {}, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})), "fn");
        let shell = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell");
        const cst = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.const(d.u32, 1), "cst");
        console.log(bindGroupLayout, vertexLayout);"
      `);
  });

  it(`works with tgpu['~unstable'] items`, () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      let nothing, accessor = tgpu['~unstable'].accessor(d.u32);
      const hello = tgpu.comptime(() => 1 + 2);

      console.log(accessor, shell, fn, cst);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        let nothing,
          accessor = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].accessor(d.u32), "accessor");
        const hello = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.comptime(() => 1 + 2), "hello");
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
      const myComputeFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );
      const myVertexFn = tgpu.vertexFn({ out: { ret: d.i32 } })(
        () => ({ ret: 0 }),
      );
      const myFragmentFn = tgpu.fragmentFn({
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
        const myFunction = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => 0, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})), "myFunction");
        const myComputeFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.computeFn({
          workgroupSize: [1]
        })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {}, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})), "myComputeFn");
        const myVertexFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexFn({
          out: {
            ret: d.i32
          }
        })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => ({
          ret: 0
        }), {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})), "myVertexFn");
        const myFragmentFn = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fragmentFn({
          in: {
            position: d.builtin.position
          },
          out: d.vec4f
        })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => d.vec4f(), {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[[10,[6,[7,"d","vec4f"],[]]]]],"externalNames":["d"]},
          externals: () => {
            return {
              d
            };
          }
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

  it('works with assignment expressions', () => {
    const code = `\
      let layout;
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        });
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "let layout;
        layout = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({
          foo: {
            uniform: vec3f
          }
        }), "layout");"
      `);
  });

  it('works with properties', () => {
    const code = `\
      const mySchemas = {
        myStruct: d.struct({ a: d.vec3f })
      };
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "const mySchemas = {
          myStruct: (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
            a: d.vec3f
          }), "myStruct")
        };"
      `);
  });

  it('works with functions', () => {
    const code = `\
      const myFun1 = () => {
        'use gpu';
        return 0;
      };

      const myFun2 = function () {
        'use gpu';
        return 0;
      };

      function myFun3() {
        'use gpu';
        return 0;
      }
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "const myFun1 = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          'use gpu';

          return 0;
        }, {
          v: 1,
          name: "myFun1",
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({});
        const myFun2 = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function () {
          'use gpu';

          return 0;
        }, {
          v: 1,
          name: "myFun2",
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({});
        const myFun3 = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function myFun3() {
          'use gpu';

          return 0;
        }, {
          v: 1,
          name: "myFun3",
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({});"
      `);
  });

  it('works with class properties', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
      }
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        const root = await tgpu.init();
        class MyController {
          myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
        }"
      `);
  });

  it('works with object properties', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      const items: { myBuffer: unknown } = { myBuffer: undefined };

      items.myBuffer = root.createUniform(d.u32);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        const root = await tgpu.init();
        const items: {
          myBuffer: unknown;
        } = {
          myBuffer: undefined
        };
        items.myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");"
      `);
  });

  it('works with assigning to "this" property', () => {
    const code = `\
      import tgpu, { type TgpuUniform } from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer: TgpuUniform<d.U32>;

        constructor() {
          this.myBuffer = root.createUniform(d.u32);
        }
      }
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu, { type TgpuUniform } from 'typegpu';
        import * as d from 'typegpu/data';
        const root = await tgpu.init();
        class MyController {
          myBuffer: TgpuUniform<d.U32>;
          constructor() {
            this.myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
          }
        }"
      `);
  });

  it('works with assigning to "this" private property', () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        #myBuffer;

        constructor() {
          this.#myBuffer = root.createUniform(d.u32);
        }

        get myBuffer() {
          return this.#myBuffer;
        }
      }

      console.log(MyController);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        const root = await tgpu.init();
        class MyController {
          #myBuffer;
          constructor() {
            this.#myBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
          }
          get myBuffer() {
            return this.#myBuffer;
          }
        }
        console.log(MyController);"
      `);
  });

  it('works with guarded pipelines', () => {
    const code = `\
      import tgpu from 'typegpu';

      const root = await tgpu.init();

      const myGuardedPipeline = root.createGuardedComputePipeline(() => {
        'use gpu';
      });

      const anotherGuardedPipeline = root
        .createGuardedComputePipeline(() => {
          'use gpu';
        }).dispatchThreads();

      console.log(myGuardedPipeline, anotherGuardedPipeline);
    `;

    expect(babelTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        const root = await tgpu.init();
        const myGuardedPipeline = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          'use gpu';
        }, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})), "myGuardedPipeline");
        const anotherGuardedPipeline = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          'use gpu';
        }, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})).dispatchThreads(), "anotherGuardedPipeline");
        console.log(myGuardedPipeline, anotherGuardedPipeline);"
      `);
  });
});

describe('[ROLLUP] auto naming', () => {
  it('works with tgpu items', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32));
      let shell = tgpu.fn([]);
      var fn = tgpu.fn([])(() => {});
      let nothing, accessor = tgpu.accessor(d.u32);
      const cst = tgpu.const(d.u32, 1);

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const bindGroupLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout"));
              const vertexLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout(d.arrayOf(d.u32)), "vertexLayout"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}))), "fn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.accessor(d.u32), "accessor"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.const(d.u32, 1), "cst"));

              console.log(bindGroupLayout, vertexLayout);
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
      const myComputeFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );
      const myVertexFn = tgpu.vertexFn({ out: { ret: d.i32 } })(
        () => ({ ret: 0 }),
      );
      const myFragmentFn = tgpu.fragmentFn({
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

        ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => 0), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}))), "myFunction"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.computeFn({ workgroupSize: [1] })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({})),
              ), "myComputeFn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexFn({ out: { ret: d.i32 } })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => ({ ret: 0 })), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({})),
              ), "myVertexFn"));
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fragmentFn({
                in: { position: d.builtin.position },
                out: d.vec4f,
              })(
                (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => d.vec4f()), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[[10,[6,[7,"d","vec4f"],[]]]]],"externalNames":["d"]},
                      externals: () => ({d}),
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

  it('works with assignment expressions', async () => {
    const code = `\
      let layout;
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        });
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
                .bindGroupLayout({
                  foo: { uniform: vec3f },
                }), "layout"));
        "
      `);
  });

  it('works with properties', async () => {
    const code = `\
      const mySchemas = {
        myStruct: d.struct({ a: d.vec3f })
      };
    `;

    expect(
      await rollupTransform(code, {
        autoNamingEnabled: true,
        earlyPruning: false,
      }),
    )
      .toMatchInlineSnapshot(`
        "({
                myStruct: ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.vec3f }), "myStruct"))
              });
        "
      `);
  });

  it('works with functions', async () => {
    const code = `\
      const myFun1 = () => {
        'use gpu';
        return 0;
      };

      const myFun2 = function () {
        'use gpu';
        return 0;
      };

      function myFun3() {
        'use gpu';
        return 0;
      }

      console.log(myFun1, myFun2, myFun3);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "const myFun1 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                'use gpu';
                return 0;
              }), {
                      v: 1,
                      name: "myFun1",
                      ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}));

              const myFun2 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function () {
                'use gpu';
                return 0;
              }), {
                      v: 1,
                      name: "myFun2",
                      ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}));

              const myFun3 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function myFun3() {
                'use gpu';
                return 0;
              }), {
                      v: 1,
                      name: "myFun3",
                      ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}));

              console.log(myFun1, myFun2, myFun3);
        "
      `);
  });

  it('works with class properties', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
      }

      console.log(MyController)
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const root = await tgpu.init();

              class MyController {
                myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
              }

              console.log(MyController);
        "
      `);
  });

  it('works with object properties', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      const items = { myBuffer: undefined };

      items.myBuffer = root.createUniform(d.u32);

      console.log(items.myBuffer)
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const root = await tgpu.init();

              const items = { myBuffer: undefined };

              items.myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));

              console.log(items.myBuffer);
        "
      `);
  });

  it('works with assigning to "this" property', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer;

        constructor() {
          this.myBuffer = root.createUniform(d.u32);
        }
      }

      console.log(MyController)
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const root = await tgpu.init();

              class MyController {
                myBuffer;

                constructor() {
                  this.myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
                }
              }

              console.log(MyController);
        "
      `);
  });

  it('works with assigning to "this" private property', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        #myBuffer;

        constructor() {
          this.#myBuffer = root.createUniform(d.u32);
        }

        get myBuffer() {
          return this.#myBuffer;
        }
      }

      console.log(MyController);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const root = await tgpu.init();

              class MyController {
                #myBuffer;

                constructor() {
                  this.#myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
                }

                get myBuffer() {
                  return this.#myBuffer;
                }
              }

              console.log(MyController);
        "
      `);
  });

  it('works with guarded pipelines', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const root = await tgpu.init();

      const myGuardedPipeline = root.createGuardedComputePipeline(() => {
        'use gpu';
      });

      const anotherGuardedPipeline = root
        .createGuardedComputePipeline(() => {
          'use gpu';
        })
        .dispatchThreads();

      console.log(myGuardedPipeline, anotherGuardedPipeline);
    `;

    expect(await rollupTransform(code, { autoNamingEnabled: true }))
      .toMatchInlineSnapshot(`
        "import tgpu from 'typegpu';

        const root = await tgpu.init();

              const myGuardedPipeline = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                'use gpu';
              }), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({}))), "myGuardedPipeline"));

              const anotherGuardedPipeline = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root
                .createGuardedComputePipeline((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                  'use gpu';
                }), {
                      v: 1,
                      name: undefined,
                      ast: {"params":[],"body":[0,[]],"externalNames":[]},
                      externals: () => ({}),
                    }) && $.f)({})))
                .dispatchThreads(), "anotherGuardedPipeline"));

              console.log(myGuardedPipeline, anotherGuardedPipeline);
        "
      `);
  });
});

describe('[WEBPACK] auto naming', () => {
  it('works with tgpu items', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = tgpu.bindGroupLayout({});
      const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32));
      let shell = tgpu.fn([]);
      var fn = tgpu.fn([])(() => {});
      let nothing, accessor = tgpu.accessor(d.u32);
      const cst = tgpu.const(d.u32, 1);

      console.log(bindGroupLayout, vertexLayout);
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            

            const bindGroupLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].bindGroupLayout({}), "bindGroupLayout"));
            const vertexLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].vertexLayout(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.arrayOf(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32)), "vertexLayout"));
            let shell = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([]), "shell"));
            var fn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}))), "fn"));
            let nothing, accessor = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].accessor(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32), "accessor"));
            const cst = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"]["const"](typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32, 1), "cst"));

            console.log(bindGroupLayout, vertexLayout);
          
      })();

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

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
            
            

            const myStruct1 = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu_data__WEBPACK_IMPORTED_MODULE_0__.struct({ a: typegpu_data__WEBPACK_IMPORTED_MODULE_0__.u32 }), "myStruct1"));
            const myStruct2 = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))((0,typegpu_data__WEBPACK_IMPORTED_MODULE_0__.struct)({ a: u32 }), "myStruct2"));
            const bait = typegpu_data__WEBPACK_IMPORTED_MODULE_0__.i32(1);

            console.log(myStruct1, myStruct2, bait);
          
      })();

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

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
            

            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();
            const myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer"));

            console.log(myBuffer);
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it('works with functions', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const myFunction = tgpu.fn([])(() => 0);
      const myComputeFn = tgpu.computeFn({ workgroupSize: [1] })(
        () => {},
      );
      const myVertexFn = tgpu.vertexFn({ out: { ret: d.i32 } })(
        () => ({ ret: 0 }),
      );
      const myFragmentFn = tgpu.fragmentFn({
        in: { position: d.builtin.position },
        out: d.vec4f,
      })(
        () => d.vec4f(),
      );
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            

            const myFunction = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => 0), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}))), "myFunction"));
            const myComputeFn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].computeFn({ workgroupSize: [1] })(
              (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})),
            ), "myComputeFn"));
            const myVertexFn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].vertexFn({ out: { ret: typegpu_data__WEBPACK_IMPORTED_MODULE_1__.i32 } })(
              (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => ({ ret: 0 })), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})),
            ), "myVertexFn"));
            const myFragmentFn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fragmentFn({
              in: { position: typegpu_data__WEBPACK_IMPORTED_MODULE_1__.builtin.position },
              out: typegpu_data__WEBPACK_IMPORTED_MODULE_1__.vec4f,
            })(
              (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => typegpu_data__WEBPACK_IMPORTED_MODULE_1__.vec4f()), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,[6,[7,"d","vec4f"],[]]]]],"externalNames":["d"]},
                    externals: () => ({d: typegpu_data__WEBPACK_IMPORTED_MODULE_1__}),
                  }) && $.f)({})),
            ), "myFragmentFn"));
          
      })();

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

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "
            const myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32)
              .$usage('storage')
              .$addFlags(GPUBufferUsage.STORAGE), "myBuffer"));
            const Item = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "Item"));
            const myFn = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn(
              [Item],
              Item,
            ) /* wgsl */\`(item: Item) -> Item { return item; }\`
              .$uses({ Item }), "myFn"));
            const myLayout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
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

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            
            

            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();
            const myBuffer = root.createBuffer(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32, 2).$name('int buffer');

            const myStruct = (0,typegpu_data__WEBPACK_IMPORTED_MODULE_1__.struct)({ a: u32 }).$name('myStruct');

            console.log(myBuffer, myStruct)

          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it("doesn't name non-tgpu stuff", async () => {
    const code = `\
      const a = 1;
      const b = "root.createBuffer()";
      const c = () => {};

      console.log(a, b, c);
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "      const a = 1;
            const b = "root.createBuffer()";
            const c = () => {};

            console.log(a, b, c);
          
      "
    `);
  });

  it('works with assignment expressions', async () => {
    const code = `\
      let layout;
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        });
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "      let layout;
            layout = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
              .bindGroupLayout({
                foo: { uniform: vec3f },
              }), "layout"));
          
      "
    `);
  });

  it('works with properties', async () => {
    const code = `\
      const mySchemas = {
        myStruct: d.struct({ a: d.vec3f })
      };
    `;

    expect(
      await webpackTransform(code, {
        autoNamingEnabled: true,
        earlyPruning: false,
      }),
    ).toMatchInlineSnapshot(`
      "      const mySchemas = {
              myStruct: ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.vec3f }), "myStruct"))
            };
          
      "
    `);
  });

  it('works with functions', async () => {
    const code = `\
      const myFun1 = () => {
        'use gpu';
        return 0;
      };

      const myFun2 = function () {
        'use gpu';
        return 0;
      };

      function myFun3() {
        'use gpu';
        return 0;
      }

      console.log(myFun1, myFun2, myFun3);
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "      const myFun1 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              'use gpu';
              return 0;
            }), {
                    v: 1,
                    name: "myFun1",
                    ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}));

            const myFun2 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function () {
              'use gpu';
              return 0;
            }), {
                    v: 1,
                    name: "myFun2",
                    ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}));

            const myFun3 = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function myFun3() {
              'use gpu';
              return 0;
            }), {
                    v: 1,
                    name: "myFun3",
                    ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}))

            console.log(myFun1, myFun2, myFun3);
          
      "
    `);
  });

  it('works with class properties', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
      }

      console.log(MyController)
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            
            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

            class MyController {
              myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32), "myBuffer"));
            }

            console.log(MyController)
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it('works with object properties', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      const items = { myBuffer: undefined };

      items.myBuffer = root.createUniform(d.u32);

      console.log(items.myBuffer)
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            
            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

            const items = { myBuffer: undefined };

            items.myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32), "myBuffer"));

            console.log(items.myBuffer)
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it('works with assigning to "this" property', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();

      class MyController {
        myBuffer;

        constructor() {
          this.myBuffer = root.createUniform(d.u32);
        }
      }

      console.log(MyController)
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            
            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

            class MyController {
              myBuffer;

              constructor() {
                this.myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32), "myBuffer"));
              }
            }

            console.log(MyController)
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it('works with assigning to "this" private property', async () => {
    const code = `\
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        #myBuffer;

        constructor() {
          this.#myBuffer = root.createUniform(d.u32);
        }

        get myBuffer() {
          return this.#myBuffer;
        }
      }

      console.log(MyController);
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
            
            

            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

            class MyController {
              #myBuffer;

              constructor() {
                this.#myBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32), "myBuffer"));
              }

              get myBuffer() {
                return this.#myBuffer;
              }
            }

            console.log(MyController);
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });

  it('works with guarded pipelines', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const root = await tgpu.init();

      const myGuardedPipeline = root.createGuardedComputePipeline(() => {
        'use gpu';
      });

      const anotherGuardedPipeline = root
        .createGuardedComputePipeline(() => {
          'use gpu';
        })
        .dispatchThreads();

      console.log(myGuardedPipeline, anotherGuardedPipeline);
    `;

    expect(await webpackTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      /******/ var __webpack_modules__ = ([
      /* 0 */
      /***/ ((module, __webpack_exports__, __webpack_require__) => {

      __webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
            

            const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

            const myGuardedPipeline = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              'use gpu';
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}))), "myGuardedPipeline"));

            const anotherGuardedPipeline = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root
              .createGuardedComputePipeline((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                'use gpu';
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})))
              .dispatchThreads(), "anotherGuardedPipeline"));

            console.log(myGuardedPipeline, anotherGuardedPipeline);
          
      __webpack_async_result__();
      } catch(e) { __webpack_async_result__(e); } }, 1);

      /***/ }),
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/async module */
      /******/ (() => {
      /******/ 	var hasSymbol = typeof Symbol === "function";
      /******/ 	var webpackQueues = hasSymbol ? Symbol("webpack queues") : "__webpack_queues__";
      /******/ 	var webpackExports = hasSymbol ? Symbol("webpack exports") : "__webpack_exports__";
      /******/ 	var webpackError = hasSymbol ? Symbol("webpack error") : "__webpack_error__";
      /******/ 	
      /******/ 	var resolveQueue = (queue) => {
      /******/ 		if(queue && queue.d < 1) {
      /******/ 			queue.d = 1;
      /******/ 			queue.forEach((fn) => (fn.r--));
      /******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
      /******/ 		}
      /******/ 	}
      /******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
      /******/ 		if(dep !== null && typeof dep === "object") {
      /******/ 	
      /******/ 			if(dep[webpackQueues]) return dep;
      /******/ 			if(dep.then) {
      /******/ 				var queue = [];
      /******/ 				queue.d = 0;
      /******/ 				dep.then((r) => {
      /******/ 					obj[webpackExports] = r;
      /******/ 					resolveQueue(queue);
      /******/ 				}, (e) => {
      /******/ 					obj[webpackError] = e;
      /******/ 					resolveQueue(queue);
      /******/ 				});
      /******/ 				var obj = {};
      /******/ 	
      /******/ 				obj[webpackQueues] = (fn) => (fn(queue));
      /******/ 				return obj;
      /******/ 			}
      /******/ 		}
      /******/ 		var ret = {};
      /******/ 		ret[webpackQueues] = x => {};
      /******/ 		ret[webpackExports] = dep;
      /******/ 		return ret;
      /******/ 	}));
      /******/ 	__webpack_require__.a = (module, body, hasAwait) => {
      /******/ 		var queue;
      /******/ 		hasAwait && ((queue = []).d = -1);
      /******/ 		var depQueues = new Set();
      /******/ 		var exports = module.exports;
      /******/ 		var currentDeps;
      /******/ 		var outerResolve;
      /******/ 		var reject;
      /******/ 		var promise = new Promise((resolve, rej) => {
      /******/ 			reject = rej;
      /******/ 			outerResolve = resolve;
      /******/ 		});
      /******/ 		promise[webpackExports] = exports;
      /******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
      /******/ 		module.exports = promise;
      /******/ 		var handle = (deps) => {
      /******/ 			currentDeps = wrapDeps(deps);
      /******/ 			var fn;
      /******/ 			var getResult = () => (currentDeps.map((d) => {
      /******/ 	
      /******/ 				if(d[webpackError]) throw d[webpackError];
      /******/ 				return d[webpackExports];
      /******/ 			}))
      /******/ 			var promise = new Promise((resolve) => {
      /******/ 				fn = () => (resolve(getResult));
      /******/ 				fn.r = 0;
      /******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
      /******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
      /******/ 			});
      /******/ 			return fn.r ? promise : getResult();
      /******/ 		}
      /******/ 		var done = (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue))
      /******/ 		body(handle, done);
      /******/ 		queue && queue.d < 0 && (queue.d = 0);
      /******/ 	};
      /******/ })();
      /******/ 
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      /******/ 
      /******/ // startup
      /******/ // Load entry module and return exports
      /******/ // This entry module used 'module' so it can't be inlined
      /******/ var __webpack_exports__ = __webpack_require__(0);
      /******/ __webpack_exports__ = await __webpack_exports__;
      /******/ 
      "
    `);
  });
});

import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const bindGroupLayout = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout");
      const vertexLayout = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout(d.arrayOf(d.u32)), "vertexLayout");
      var fn = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {}, {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, []],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({})), "fn");
      let shell = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell");
      const cst = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.const(d.u32, 1), "cst");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      let nothing,
        accessor = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].accessor(d.u32), "accessor");
      const hello = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.comptime(() => 1 + 2), "hello");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';
      const myStruct1 = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
        a: d.u32
      }), "myStruct1");
      const myStruct2 = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(struct({
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const root = await tgpu.init();
      const myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const myFunction = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => 0, {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, [[10, [5, "0"]]]],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({})), "myFunction");
      const myComputeFn = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.computeFn({
        workgroupSize: [1]
      })(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {}, {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, []],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({})), "myComputeFn");
      const myVertexFn = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexFn({
        out: {
          ret: d.i32
        }
      })(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => ({
        ret: 0
      }), {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, [[10, [104, {
            ret: [5, "0"]
          }]]]],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({})), "myVertexFn");
      const myFragmentFn = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fragmentFn({
        in: {
          position: d.builtin.position
        },
        out: d.vec4f
      })(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => d.vec4f(), {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, [[10, [6, [7, "d", "vec4f"], []]]]],
          externalNames: ["d"]
        },
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "const myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32).$usage('storage').$addFlags(GPUBufferUsage.STORAGE), "myBuffer");
      const Item = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
        a: d.u32
      }), "Item");
      const myFn = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([Item], Item) /* wgsl */\`(item: Item) -> Item { return item; }\`.$uses({
        Item
      }), "myFn");
      const myLayout = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "let layout;
      layout = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "const mySchemas = {
        myStruct: /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "const myFun3 = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function myFun3() {
        'use gpu';

        return 0;
      }, {
        v: 1,
        name: "myFun3",
        ast: {
          params: [],
          body: [0, [[10, [5, "0"]]]],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({});
      const myFun1 = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';

        return 0;
      }, {
        v: 1,
        name: "myFun1",
        ast: {
          params: [],
          body: [0, [[10, [5, "0"]]]],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({});
      const myFun2 = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function () {
        'use gpu';

        return 0;
      }, {
        v: 1,
        name: "myFun2",
        ast: {
          params: [],
          body: [0, [[10, [5, "0"]]]],
          externalNames: []
        },
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      class MyController {
        myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      const items: {
        myBuffer: unknown;
      } = {
        myBuffer: undefined
      };
      items.myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");"
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu, { type TgpuUniform } from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      class MyController {
        myBuffer: TgpuUniform<d.U32>;
        constructor() {
          this.myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      class MyController {
        #myBuffer;
        constructor() {
          this.#myBuffer = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer");
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

    expect(babelTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const root = await tgpu.init();
      const myGuardedPipeline = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';
      }, {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, []],
          externalNames: []
        },
        externals: () => {
          return {};
        }
      }) && $.f)({})), "myGuardedPipeline");
      const anotherGuardedPipeline = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';
      }, {
        v: 1,
        name: undefined,
        ast: {
          params: [],
          body: [0, []],
          externalNames: []
        },
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const bindGroupLayout = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.bindGroupLayout({}), "bindGroupLayout"));
            const vertexLayout = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexLayout(d.arrayOf(d.u32)), "vertexLayout"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([]), "shell"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
          v: 1,
          name: undefined,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({}))), "fn"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.accessor(d.u32), "accessor"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.const(d.u32, 1), "cst"));

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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import * as d from 'typegpu/data';
      import { struct } from 'typegpu/data';

      const myStruct1 = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "myStruct1"));
            const myStruct2 = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(struct({ a: u32 }), "myStruct2"));
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const root = await tgpu.init();
            const myBuffer = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32, 2), "myBuffer"));

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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn([])((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => 0), {
          v: 1,
          name: undefined,
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({}))), "myFunction"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.computeFn({ workgroupSize: [1] })(
              (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
          v: 1,
          name: undefined,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({})),
            ), "myComputeFn"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.vertexFn({ out: { ret: d.i32 } })(
              (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => ({ ret: 0 })), {
          v: 1,
          name: undefined,
          ast: {"params":[],"body":[0,[[10,[104,{"ret":[5,"0"]}]]]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({})),
            ), "myVertexFn"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fragmentFn({
              in: { position: d.builtin.position },
              out: d.vec4f,
            })(
              (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => d.vec4f()), {
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "(/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.u32)
              .$usage('storage')
              .$addFlags(GPUBufferUsage.STORAGE), "myBuffer"));
            const Item = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.u32 }), "Item"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.fn(
              [Item],
              Item,
            ) /* wgsl */\`(item: Item) -> Item { return item; }\`
              .$uses({ Item }), "myFn"));
            (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "(/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu
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
    ).toMatchInlineSnapshot(`
      "({
              myStruct: (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(d.struct({ a: d.vec3f }), "myStruct"))
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "const myFun3 = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function myFun3() {
              'use gpu';
              return 0;
            }), {
          v: 1,
          name: "myFun3",
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({}));

      const myFun1 = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              'use gpu';
              return 0;
            }), {
          v: 1,
          name: "myFun1",
          ast: {"params":[],"body":[0,[[10,[5,"0"]]]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({}));

            const myFun2 = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function () {
              'use gpu';
              return 0;
            }), {
          v: 1,
          name: "myFun2",
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

            class MyController {
              myBuffer = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

            const items = { myBuffer: undefined };

            items.myBuffer = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));

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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

            class MyController {
              myBuffer;

              constructor() {
                this.myBuffer = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

            class MyController {
              #myBuffer;

              constructor() {
                this.#myBuffer = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createUniform(d.u32), "myBuffer"));
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

    expect(await rollupTransform(code, { autoNamingEnabled: true })).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const root = await tgpu.init();

            const myGuardedPipeline = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createGuardedComputePipeline((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              'use gpu';
            }), {
          v: 1,
          name: undefined,
          ast: {"params":[],"body":[0,[]],"externalNames":[]},
          externals: () => ({}),
        }) && $.f)({}))), "myGuardedPipeline"));

            const anotherGuardedPipeline = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root
              .createGuardedComputePipeline((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
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

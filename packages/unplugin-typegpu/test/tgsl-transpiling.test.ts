import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', () => {
    const code = `\
        import { tgpu } from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
                const tmp = counter.$.x;
                counter.$.x = counter.$.y;
                counter.$.y += tmp;
                counter.$.z += d.f32(input.num.x);
            });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';
      const counterBuffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 0)).$usage('storage');
      const counter = counterBuffer.as('mutable');
      const increment = tgpu.computeFn({
        in: {
          num: d.builtin.numWorkgroups
        },
        workgroupSize: [1]
      })(/*#__PURE__*/__tgpu_meta(input => {
        const tmp = counter.$.x;
        counter.$.x = counter.$.y;
        counter.$.y += tmp;
        counter.$.z += d.f32(input.num.x);
      }, "[[\\"input\\"],[[13,\\"tmp\\",[7,[7,\\"counter\\",\\"$\\"],\\"x\\"]],[2,[7,[7,\\"counter\\",\\"$\\"],\\"x\\"],\\"=\\",[7,[7,\\"counter\\",\\"$\\"],\\"y\\"]],[2,[7,[7,\\"counter\\",\\"$\\"],\\"y\\"],\\"+=\\",\\"tmp\\"],[2,[7,[7,\\"counter\\",\\"$\\"],\\"z\\"],\\"+=\\",[6,\\"d.f32\\",[[7,[7,\\"input\\",\\"num\\"],\\"x\\"]]]]]]", {
        "counter": () => counter,
        "d.f32": () => d.f32
      }));"
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', () => {
    const code = `\
      import { tgpu } from 'typegpu';

      const a = tgpu.computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
      });

      const b = tgpu.fn([])(() => {
        const y = 2 + 2;
      });

      const cx = 2;
      const c = tgpu.fn([])(() => cx);

      const d = tgpu.fn([])('() {}');
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      const a = tgpu.computeFn({
        workgroupSize: [1]
      })(/*#__PURE__*/__tgpu_meta(input => {
        const x = true;
      }, "[[\\"input\\"],[[13,\\"x\\",true]]]", {}));
      const b = tgpu.fn([])(/*#__PURE__*/__tgpu_meta(() => {
        const y = 2 + 2;
      }, "[[],[[13,\\"y\\",[1,2,\\"+\\",2]]]]", {}));
      const cx = 2;
      const c = tgpu.fn([])(/*#__PURE__*/__tgpu_meta(() => cx, "[[],[[10,\\"cx\\"]]]", {
        "cx": () => cx
      }));
      const d = tgpu.fn([])('() {}');"
    `);
  });

  it('transpiles only function shell invocations', () => {
    const code = `\
        import { tgpu } from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()(d.arrayOf(d.u32));
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';
      tgpu.x()(d.arrayOf(d.u32));"
    `);
  });

  it('works with some typescript features', () => {
    const code = `\
        import { tgpu } from 'typegpu';

        const fun = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true;
        });

        const funcWithAs = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true as boolean;
        });

        const funcWithSatisfies = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true satisfies boolean;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      const fun = tgpu.computeFn({
        workgroupSize: [1]
      })(/*#__PURE__*/__tgpu_meta(input => {
        const x = true;
      }, "[[\\"input\\"],[[13,\\"x\\",true]]]", {}));
      const funcWithAs = tgpu.computeFn({
        workgroupSize: [1]
      })(/*#__PURE__*/__tgpu_meta(input => {
        const x = true as boolean;
      }, "[[\\"input\\"],[[13,\\"x\\",true]]]", {}));
      const funcWithSatisfies = tgpu.computeFn({
        workgroupSize: [1]
      })(/*#__PURE__*/__tgpu_meta(input => {
        const x = true satisfies boolean;
      }, "[[\\"input\\"],[[13,\\"x\\",true]]]", {}));"
    `);
  });

  it('correctly lists "this" in externals', () => {
    const code = `
      import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(() => {
          return this.myBuffer.$;
        });
      }

      const myController = new MyController();

      console.log(tgpu.resolve([myController.myFn]));`;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(/*#__PURE__*/__tgpu_meta(() => {
          return this.myBuffer.$;
        }, "[[],[[10,[7,\\"this.myBuffer\\",\\"$\\"]]]]", {
          "this.myBuffer": () => this.myBuffer
        }));
      }
      const myController = new MyController();
      console.log(tgpu.resolve([myController.myFn]));"
    `);
  });
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', async () => {
    const code = `\
        import { tgpu } from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
            const tmp = counter.$.x;
            counter.$.x = counter.$.y;
            counter.$.y += tmp;
            counter.$.z += d.f32(input.num.x);
            });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

              const counterBuffer = root
                  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
                  .$usage('storage');
              const counter = counterBuffer.as('mutable');

              tgpu
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((/*#__PURE__*/__tgpu_meta((input) => {
                  const tmp = counter.$.x;
                  counter.$.x = counter.$.y;
                  counter.$.y += tmp;
                  counter.$.z += d.f32(input.num.x);
                  }, '[["input"],[[13,"tmp",[7,[7,"counter","$"],"x"]],[2,[7,[7,"counter","$"],"x"],"=",[7,[7,"counter","$"],"y"]],[2,[7,[7,"counter","$"],"y"],"+=","tmp"],[2,[7,[7,"counter","$"],"z"],"+=",[6,"d.f32",[[7,[7,"input","num"],"x"]]]]]]', {"counter":() => counter,"d.f32":() => d.f32})));
      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import { tgpu } from 'typegpu';

        const a = tgpu.computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
        });

        const b = tgpu.fn([])(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu.fn([])(() => cx);

        const d = tgpu.fn([])('() {}');
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

              tgpu.computeFn({ workgroupSize: [1] })((/*#__PURE__*/__tgpu_meta((input) => {
              }, '[["input"],[[13,"x",true]]]', {})));

              tgpu.fn([])((/*#__PURE__*/__tgpu_meta(() => {
              }, '[[],[[13,"y",[1,2,"+",2]]]]', {})));

              const cx = 2;
              tgpu.fn([])((/*#__PURE__*/__tgpu_meta(() => cx, '[[],[[10,"cx"]]]', {"cx":() => cx})));

              tgpu.fn([])('() {}');
      "
    `);
  });

  it('transpiles only function shell invocations', async () => {
    const code = `\
        import { tgpu } from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()(d.arrayOf(d.u32));
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      tgpu.x()(d.arrayOf(d.u32));
      "
    `);
  });

  it('correctly lists "this" in externals', async () => {
    const code = `
      import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(() => {
          return this.myBuffer.$;
        });
      }

      const myController = new MyController();

      console.log(tgpu.resolve([myController.myFn]));`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

            const root = await tgpu.init();

            class MyController {
              myBuffer = root.createUniform(d.u32);
              myFn = tgpu.fn([], d.u32)((/*#__PURE__*/__tgpu_meta(() => {
                return this.myBuffer.$;
              }, '[[],[[10,[7,"this.myBuffer","$"]]]]', {"this.myBuffer":() => this.myBuffer})));
            }

            const myController = new MyController();

            console.log(tgpu.resolve([myController.myFn]));
      "
    `);
  });
});

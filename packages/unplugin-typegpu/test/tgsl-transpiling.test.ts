import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
                const tmp = counter.value.x;
                counter.value.x = counter.value.y;
                counter.value.y += tmp;
                counter.value.z += d.f32(input.num.x);
            });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const counterBuffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 0)).$usage('storage');
      const counter = counterBuffer.as('mutable');
      const increment = tgpu.computeFn({
        in: {
          num: d.builtin.numWorkgroups
        },
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const tmp = counter.value.x;
        counter.value.x = counter.value.y;
        counter.value.y += tmp;
        counter.value.z += d.f32(input.num.x);
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
          externals: {counter, d},
        }) && $.f)({}));"
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
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
      "import tgpu from 'typegpu';
      const a = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true;
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));
      const b = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const y = 2 + 2;
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));
      const cx = 2;
      const c = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => cx, {
          v: 1,
          ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
          externals: {cx},
        }) && $.f)({}));
      const d = tgpu.fn([])('() {}');"
    `);
  });

  it('transpiles only function shell invocations', () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()((n) => d.arrayOf(d.u32, n));
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      tgpu.x()(n => d.arrayOf(d.u32, n));"
    `);
  });

  it('works with some typescript features', () => {
    const code = `\
        import tgpu from 'typegpu';

        const fun = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
          const x = true;
        });

        const funcWithAs = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
          const x = true as boolean;
        });

        const funcWithSatisfies = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
          const x = true satisfies boolean;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const fun = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true;
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));
      const funcWithAs = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true as boolean;
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));
      const funcWithSatisfies = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true satisfies boolean;
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
          externals: {},
        }) && $.f)({}));"
    `);
  });
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        
        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');
        
        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
            const tmp = counter.value.x;
            counter.value.x = counter.value.y;
            counter.value.y += tmp;
            counter.value.z += d.f32(input.num.x);
            });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const counterBuffer = root
                  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
                  .$usage('storage');
              const counter = counterBuffer.as('mutable');
              
              tgpu
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
                  const tmp = counter.value.x;
                  counter.value.x = counter.value.y;
                  counter.value.y += tmp;
                  counter.value.z += d.f32(input.num.x);
                  }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
                    externals: {counter, d},
                  }) && $.f)({})));
      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
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
      "import tgpu from 'typegpu';

      tgpu['~unstable'].computeFn({ workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
              }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({})));

              tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              }), {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({})));

              const cx = 2;
              tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => cx), {
                    v: 1,
                    ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
                    externals: {cx},
                  }) && $.f)({})));

              tgpu.fn([])('() {}');
      "
    `);
  });

  it('transpiles only function shell invocations', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()((n) => d.arrayOf(d.u32, n));
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      tgpu.x()((n) => d.arrayOf(d.u32, n));
      "
    `);
  });
});

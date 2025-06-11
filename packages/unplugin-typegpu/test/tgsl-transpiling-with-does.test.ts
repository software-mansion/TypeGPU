import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

// TODO: remove along with the deprecated 'does' method.

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to does with globalThis set call', () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu['~unstable']
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
            .does((input) => {
                const tmp = counter.value.x;
                counter.value.x = counter.value.y;
                counter.value.y += tmp;
                counter.value.z += d.f32(input.num.x);
            });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const counterBuffer = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root.createBuffer(d.vec3f, d.vec3f(0, 1, 0)).$usage('storage'), "counterBuffer");
      const counter = counterBuffer.as('mutable');
      const increment = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].computeFn({
        in: {
          num: d.builtin.numWorkgroups
        },
        workgroupSize: [1]
      }).does(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
          externals: {counter, d},
        }) && $.f)({})), "increment");"
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] }).does((input) => {
        const x = true;
        });

        const b = tgpu['~unstable'].fn([]).does(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu['~unstable'].fn([]).does(() => cx);

        const d = tgpu['~unstable'].fn([]).does('() {}');
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const a = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      }).does(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "a");
      const b = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
          externals: {},
        }) && $.f)({})), "b");
      const cx = 2;
      const c = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        throw new Error("The function \\"<unnamed>\\" is invokable only on the GPU. If you want to use it on the CPU, mark it with the \\"kernel & js\\" directive.");
      }, {
          v: 1,
          ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
          externals: {cx},
        }) && $.f)({})), "c");
      const d = (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does('() {}'), "d");"
    `);
  });
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to does with globalThis set call', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';
        
        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');
        
        const increment = tgpu['~unstable']
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
            .does((input) => {
            const tmp = counter.value.x;
            counter.value.x = counter.value.y;
            counter.value.y += tmp;
            counter.value.z += d.f32(input.num.x);
            });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const counterBuffer = ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(root
                  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
                  .$usage('storage'), "counterBuffer"));
              const counter = counterBuffer.as('mutable');
              
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable']
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
                  .does((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
                    externals: {counter, d},
                  }) && $.f)({}))), "increment"));
      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] }).does((input) => {
        const x = true;
        });

        const b = tgpu['~unstable'].fn([]).does(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu['~unstable'].fn([]).does(() => cx);

        const d = tgpu['~unstable'].fn([]).does('() {}');
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].computeFn({ workgroupSize: [1] }).does((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({}))), "a"));

              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: {},
                  }) && $.f)({}))), "b"));

              const cx = 2;
              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                        throw new Error(\`The function "<unnamed>" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                      }) , {
                    v: 1,
                    ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
                    externals: {cx},
                  }) && $.f)({}))), "c"));

              ((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu['~unstable'].fn([]).does('() {}'), "d"));
      "
    `);
  });
});

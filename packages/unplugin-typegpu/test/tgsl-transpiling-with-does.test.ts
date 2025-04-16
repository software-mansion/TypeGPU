import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

// TODO: remove along with the deprecated 'does' method.

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to does with tgpu.__assignAst call', () => {
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
      const counterBuffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 0)).$usage('storage');
      const counter = counterBuffer.as('mutable');
      const increment = tgpu['~unstable'].computeFn({
        in: {
          num: d.builtin.numWorkgroups
        },
        workgroupSize: [1]
      }).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]}, {
        counter: counter,
        d: d
      }));"
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
      const a = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      }).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[0,[[13,"x",true]]],"externalNames":[]}, {}));
      const b = tgpu['~unstable'].fn([]).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]}, {}));
      const cx = 2;
      const c = tgpu['~unstable'].fn([]).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[0,[[10,"cx"]]],"externalNames":["cx"]}, {
        cx: cx
      }));
      const d = tgpu['~unstable'].fn([]).does('() {}');"
    `);
  });
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to does with tgpu.__assignAst call', async () => {
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

      const counterBuffer = root
                  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
                  .$usage('storage');
              const counter = counterBuffer.as('mutable');
              
              tgpu['~unstable']
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
                  .does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[0,[[13,"tmp",[7,[7,"counter","value"],"x"]],[2,[7,[7,"counter","value"],"x"],"=",[7,[7,"counter","value"],"y"]],[2,[7,[7,"counter","value"],"y"],"+=","tmp"],[2,[7,[7,"counter","value"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]}, {counter, d}));
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

      tgpu['~unstable'].computeFn({ workgroupSize: [1] }).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[0,[[13,"x",true]]],"externalNames":[]}));

              tgpu['~unstable'].fn([]).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]}));

              const cx = 2;
              tgpu['~unstable'].fn([]).does(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[0,[[10,"cx"]]],"externalNames":["cx"]}, {cx}));

              tgpu['~unstable'].fn([]).does('() {}');
      "
    `);
  });
});

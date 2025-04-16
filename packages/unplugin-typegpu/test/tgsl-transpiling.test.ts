import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with tgpu.__assignAst call', () => {
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
      })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[3,[[5,"tmp",[16,[16,"counter","value"],"x"]],[11,[16,[16,"counter","value"],"x"],"=",[16,[16,"counter","value"],"y"]],[11,[16,[16,"counter","value"],"y"],"+=","tmp"],[11,[16,[16,"counter","value"],"z"],"+=",[18,[16,"d","f32"],[[16,[16,"input","num"],"x"]]]]]],"externalNames":["counter","d"]}, {
        counter: counter,
        d: d
      }));"
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
        });

        const b = tgpu['~unstable'].fn([])(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu['~unstable'].fn([])(() => cx);

        const d = tgpu['~unstable'].fn([])('() {}');
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const a = tgpu['~unstable'].computeFn({
        workgroupSize: [1]
      })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[3,[[5,"x",true]]],"externalNames":[]}, {}));
      const b = tgpu['~unstable'].fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[3,[[5,"y",[10,[21,"2"],"+",[21,"2"]]]]],"externalNames":[]}, {}));
      const cx = 2;
      const c = tgpu['~unstable'].fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[3,[[1,"cx"]]],"externalNames":["cx"]}, {
        cx: cx
      }));
      const d = tgpu['~unstable'].fn([])('() {}');"
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
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with tgpu.__assignAst call', async () => {
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
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[3,[[5,"tmp",[16,[16,"counter","value"],"x"]],[11,[16,[16,"counter","value"],"x"],"=",[16,[16,"counter","value"],"y"]],[11,[16,[16,"counter","value"],"y"],"+=","tmp"],[11,[16,[16,"counter","value"],"z"],"+=",[18,[16,"d","f32"],[[16,[16,"input","num"],"x"]]]]]],"externalNames":["counter","d"]}, {counter, d}));
      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu['~unstable'].computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
        });

        const b = tgpu['~unstable'].fn([])(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu['~unstable'].fn([])(() => cx);

        const d = tgpu['~unstable'].fn([])('() {}');
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      tgpu['~unstable'].computeFn({ workgroupSize: [1] })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["input"]},"body":[3,[[5,"x",true]]],"externalNames":[]}));

              tgpu['~unstable'].fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[3,[[5,"y",[10,[21,"2"],"+",[21,"2"]]]]],"externalNames":[]}));

              const cx = 2;
              tgpu['~unstable'].fn([])(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":[]},"body":[3,[[1,"cx"]]],"externalNames":["cx"]}, {cx}));

              tgpu['~unstable'].fn([])('() {}');
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

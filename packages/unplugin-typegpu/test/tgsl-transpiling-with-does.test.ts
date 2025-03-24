import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform';

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
      }).does(tgpu.__assignAst(input => {
        const tmp = counter.value.x;
        counter.value.x = counter.value.y;
        counter.value.y += tmp;
        counter.value.z += d.f32(input.num.x);
      }, {"argNames":["input"],"body":{"b":[{"c":["tmp",{"a":[{"a":["counter","value"]},"x"]}]},{"x":[{"a":[{"a":["counter","value"]},"x"]},"=",{"a":[{"a":["counter","value"]},"y"]}]},{"x":[{"a":[{"a":["counter","value"]},"y"]},"+=","tmp"]},{"x":[{"a":[{"a":["counter","value"]},"z"]},"+=",{"f":[{"a":["d","f32"]},[{"a":[{"a":["input","num"]},"x"]}]]}]}]},"externalNames":["counter","d"]}, {
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
      }).does(tgpu.__assignAst(input => {
        const x = true;
      }, {"argNames":["input"],"body":{"b":[{"c":["x",true]}]},"externalNames":[]}, {}));
      const b = tgpu['~unstable'].fn([]).does(tgpu.__assignAst(() => {
        const y = 2 + 2;
      }, {"argNames":[],"body":{"b":[{"c":["y",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}, {}));
      const cx = 2;
      const c = tgpu['~unstable'].fn([]).does(tgpu.__assignAst(() => cx, {"argNames":[],"body":{"b":[{"r":"cx"}]},"externalNames":["cx"]}, {
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
                  .does(tgpu.__assignAst((input) => {
                  const tmp = counter.value.x;
                  counter.value.x = counter.value.y;
                  counter.value.y += tmp;
                  counter.value.z += d.f32(input.num.x);
                  }, {"argNames":["input"],"body":{"b":[{"c":["tmp",{"a":[{"a":["counter","value"]},"x"]}]},{"x":[{"a":[{"a":["counter","value"]},"x"]},"=",{"a":[{"a":["counter","value"]},"y"]}]},{"x":[{"a":[{"a":["counter","value"]},"y"]},"+=","tmp"]},{"x":[{"a":[{"a":["counter","value"]},"z"]},"+=",{"f":[{"a":["d","f32"]},[{"a":[{"a":["input","num"]},"x"]}]]}]}]},"externalNames":["counter","d"]}, {counter, d}));
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

      tgpu['~unstable'].computeFn({ workgroupSize: [1] }).does(tgpu.__assignAst((input) => {
              }, {"argNames":["input"],"body":{"b":[{"c":["x",true]}]},"externalNames":[]}));

              tgpu['~unstable'].fn([]).does(tgpu.__assignAst(() => {
              }, {"argNames":[],"body":{"b":[{"c":["y",{"x":[{"n":"2"},"+",{"n":"2"}]}]}]},"externalNames":[]}));

              const cx = 2;
              tgpu['~unstable'].fn([]).does(tgpu.__assignAst(() => cx, {"argNames":[],"body":{"b":[{"r":"cx"}]},"externalNames":["cx"]}, {cx}));

              tgpu['~unstable'].fn([]).does('() {}');
      "
    `);
  });
});

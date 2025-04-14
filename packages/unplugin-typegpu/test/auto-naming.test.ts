import { describe, expect, it } from 'vitest';
import { babelTransform } from './transform';

describe('[BABEL] automatic naming', () => {
  it('works for objects created from tgpu', () => {
    const code = `\
      import tgpu from 'typegpu';

      const vertexLayout = tgpu.vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      );

      const vertexLayoutWithName = tgpu.vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      ).$name('customName');

      const vertexLayoutUnstable = tgpu['~unstable'].vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      );
    `;

    expect(
      babelTransform(code, { autoNamingEnabled: true }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const vertexLayout = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayout");
      const vertexLayoutWithName = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)).$name('customName'), "vertexLayoutWithName");
      const vertexLayoutUnstable = tgpu.__autoName(tgpu['~unstable'].vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutUnstable");"
    `);
  });

  it('works for functions', () => {
    const code = `\
    import tgpu from 'typegpu';
    import * as d from 'typegpu/data';

    const foo = tgpu['~unstable'].fn({ a: d.u32 })(({ a }) => {
      const x = a;
    }).$name("hello");
  `;

    expect(
      babelTransform(code, { autoNamingEnabled: true }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const foo = tgpu.__autoName(tgpu['~unstable'].fn({
        a: d.u32
      })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"destructured-object","props":[]},"body":{"b":[{"c":["x","a"]}]},"externalNames":["a"]}, {
        a: a
      })).$name("hello"), "foo");"
    `);
  });
});

// TODO:

// describe('[ROLLUP] automatic naming', () => {
//   it('works for objects created from tgpu', async () => {
//     const code = `\
//       import tgpu from 'typegpu';

//       const vertexLayout = tgpu.vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       );

//       const vertexLayoutWithName = tgpu.vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       ).$name('customName');

//       const vertexLayoutUnstable = tgpu['~unstable'].vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       );
//     `;

//     expect(
//       await rollupTransform(code, { autoNamingEnabled: true }),
//     ).toMatchInlineSnapshot(`
//       "import tgpu from 'typegpu';
//       const vertexLayout = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayout");
//       const vertexLayoutWithName = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)).$name('customName'), "vertexLayoutWithName");
//       const vertexLayoutUnstable = tgpu.__autoName(tgpu['~unstable'].vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutUnstable");"
//     `);
//   });

//   it('works for functions', async () => {
//     const code = `\
//     import tgpu from 'typegpu';
//     import * as d from 'typegpu/data';

//     const foo = tgpu['~unstable'].fn({ a: d.u32 })(({ a }) => {
//       const x = a;
//     }).$name("hello");
//   `;

//     expect(
//       await rollupTransform(code, { autoNamingEnabled: true }),
//     ).toMatchInlineSnapshot(`
//       "import tgpu from 'typegpu';
//       import * as d from 'typegpu/data';
//       const foo = tgpu.__autoName(tgpu['~unstable'].fn({
//         a: d.u32
//       })(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"destructured-object","props":[]},"body":{"b":[{"c":["x","a"]}]},"externalNames":["a"]}, {
//         a: a
//       })).$name("hello"), "foo");"
//     `);
//   });
// });

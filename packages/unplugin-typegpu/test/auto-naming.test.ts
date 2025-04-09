import { describe, expect, it } from 'vitest';
import { babelTransform } from './transform';

describe('[BABEL] automatic naming', () => {
  it('works for vertex layouts', () => {
    const code = `\
      import tgpu from 'typegpu';

      const vertexLayout = tgpu.vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      );

      const vertexLayoutWithName = tgpu.vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      ).$name('customName');

      const vertexLayoutUnstable = tgpu['unstable'].vertexLayout((n) =>
        d.arrayOf(d.location(0, d.vec2f), n),
      );
    `;

    expect(
      babelTransform(code, { autoNamingEnabled: true }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const vertexLayout = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayout");
      const vertexLayoutWithName = tgpu.__autoName(tgpu.vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutWithName").$name('customName');
      const vertexLayoutUnstable = tgpu.__autoName(tgpu['unstable'].vertexLayout(n => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutUnstable");"
    `);
  });

  it('works for functions', () => {
    // TODO: need to name functions with implementations, not shells
  });
});

// TODO:

// describe('[ROLLUP] tgpu alias gathering', async () => {
//   it('works for vertex layouts', async () => {
//     const code = `\
//       import tgpu from 'typegpu';

//       const vertexLayout = tgpu.vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       );

//       const vertexLayoutWithName = tgpu.vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       ).$name('customName');

//       const vertexLayoutUnstable = tgpu['unstable'].vertexLayout((n) =>
//         d.arrayOf(d.location(0, d.vec2f), n),
//       );
//     `;

//     expect(
//       await rollupTransform(code, { autoNamingEnabled: true }),
//     ).toMatchInlineSnapshot(`
//       "import tgpu from 'typegpu';
//       const vertexLayout = tgpu.__autoName(tgpu.vertexLayout((n) => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayout");
//       const vertexLayoutWithName = tgpu.__autoName(tgpu.vertexLayout((n) => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutWithName").$name('customName');
//       const vertexLayoutUnstable = tgpu.__autoName(tgpu['unstable'].vertexLayout((n) => d.arrayOf(d.location(0, d.vec2f), n)), "vertexLayoutUnstable");"
//     `);
//   });
// });

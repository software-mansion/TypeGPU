import { describe, expect, expectTypeOf } from 'vitest';
import { tgpu, d, std, type TgpuAccessor } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('minification', () => {
  const inner = () => {
    'use gpu';
    return 1;
  };

  const outer = () => {
    'use gpu';
    return inner();
  };

  const computeFn = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {
    'use gpu';
    outer();
  });

  it('does not minify if not set to', async () => {
    const root = await tgpu.init();
    const pipeline = root.createComputePipeline({ compute: computeFn });

    const code = tgpu.resolve([pipeline]);

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }

      fn outer() -> i32 {
        return inner();
      }

      @compute @workgroup_size(1, 1, 1) fn computeFn() {
        outer();
      }"
    `);
    expect(code).toContain('  ');
  });

  it('minifies in resolve', async () => {
    const code = tgpu.resolve([inner], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1;}"`);
    expect(code).not.toContain('  ');
  });

  it('minifies in resolveWithContext', async () => {
    const code = tgpu.resolveWithContext([inner], { unstable_minify: true }).code;

    expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1;}"`);
    expect(code).not.toContain('  ');
  });

  it('minifies in resolve with template', async () => {
    const code = tgpu.resolve({
      template: 'fn main() { inner(); }',
      externals: { inner },
      unstable_minify: true,
    });

    expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1; }fn main(){inner();}"`);
    expect(code).not.toContain('  ');
  });

  it('minifies raw wgsl implemented functions', async () => {
    const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
      return a + 1;
    }`;

    const code = tgpu.resolve([rawFn], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`"fn rawFn(a: u32)->u32{return a+1;}"`);
    expect(code).not.toContain('  ');
  });

  it('minifies raw code snippets', async () => {
    const rawCodeSnippet = tgpu['~unstable'].rawCodeSnippet('1u + 2u', d.u32, 'constant', false);
    const fn = () => {
      'use gpu';
      const a = rawCodeSnippet.$;
      return a;
    };

    const code = tgpu.resolve([fn], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`"fn fn_1()->u32{const a=1u+2u; return a;}"`);
    expect(code).not.toContain('  ');
  });

  // TODO: comment handling
  // it('removes comments', async () => {
  //   const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
  //     // a comment
  //     return a + 1; // my comment
  //     // other comment
  //   } // end of file`;

  //   const code = tgpu.resolve([rawFn], { unstable_minify: true });

  //   expect(code).toMatchInlineSnapshot();
  //   expect(code).not.toContain('  ');
  // });

  // it('removes block comments', async () => {
  //   const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
  //     /* a comment */ return a + 1; /* my comment */
  //     /* other
  //     comment */
  //   }`;

  //   const code = tgpu.resolve([rawFn], { unstable_minify: true });

  //   expect(code).toMatchInlineSnapshot();
  //   expect(code).not.toContain('  ');
  // });

  // it('removes nested block comments', async () => {
  //   const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
  //     return a + 1;
  //     /* outer
  //       /* inner */
  //     outer */
  //   }`;

  //   const code = tgpu.resolve([rawFn], { unstable_minify: true });

  //   expect(code).toMatchInlineSnapshot();
  //   expect(code).not.toContain('  ');
  // });

  // it('does not merge idents after removing block comments', async () => {
  //   const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
  //     let/* space */a = 1;
  //   }`;

  //   const code = tgpu.resolve([rawFn], { unstable_minify: true });

  //   expect(code).toMatchInlineSnapshot();
  //   expect(code).not.toContain('  ');
  // });

  it('minifies transitive dependencies in resolve', async () => {
    const code = tgpu.resolve([outer], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(
      `"fn inner()->i32{return 1;}fn outer()->i32{return inner();}"`,
    );
    expect(code).not.toContain('  ');
  });

  it('minifies in resolve if root is set to minify', async () => {
    const root = await tgpu.init({ unstable_minify: true });
    const pipeline = root.createComputePipeline({ compute: computeFn });

    const code = tgpu.resolve([pipeline]);

    expect(code).toMatchInlineSnapshot(
      `"fn inner()->i32{return 1;}fn outer()->i32{return inner();}@compute @workgroup_size(1, 1, 1) fn computeFn(){outer();}"`,
    );
    expect(code).not.toContain('  ');
  });

  it('does not minify in resolve with minify disabled even if root is set to minify', async () => {
    const root = await tgpu.init({ unstable_minify: true });
    const pipeline = root.createComputePipeline({ compute: computeFn });

    const code = tgpu.resolve([pipeline], { unstable_minify: false });

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }

      fn outer() -> i32 {
        return inner();
      }

      @compute @workgroup_size(1, 1, 1) fn computeFn() {
        outer();
      }"
    `);
    expect(code).toContain('  ');
  });
});

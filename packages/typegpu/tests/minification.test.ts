import { describe, expect, expectTypeOf, vi } from 'vitest';
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

    expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
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

  it('reduces spaces if items are separated by , or :', async () => {
    const helper = (a: number, b: number, c: number) => {
      'use gpu';
      return a + b + c;
    };

    const fn = () => {
      'use gpu';
      return helper(1, 2, 3);
    };

    const code = tgpu.resolve([fn], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(
      `"fn helper(a:i32,b:i32,c:i32)->i32{return ((a+b)+c);}fn fn_1()->i32{return helper(1i,2i,3i);}"`,
    );
    expect(code).not.toContain('  ');
  });

  it('removes comments', async () => {
    const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
      // a comment
      return a + 1; // my comment /*
      // // other comment
    } // end of file`;

    const code = tgpu.resolve([rawFn], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
    expect(code).not.toContain('  ');
  });

  it('warns when block comments are present', async () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
      /* a comment */return a + 1;/* my comment */
      /* other
      comment */
    }`;

    const code = tgpu.resolve([rawFn], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(
      `"fn rawFn(a:u32)->u32{/*a comment */return a+1;/* my comment*//*other comment*/}"`,
    );
    expect(code).not.toContain('  ');
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [block-comments-present] ",
        "Minifying does not remove block comments due to grammar complexity. If this is relevant for you, please submit an issue at https://github.com/software-mansion/TypeGPU/issues",
      ]
    `);
  });

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
      `"fn inner()->i32{return 1;}fn outer()->i32{return inner();}@compute @workgroup_size(1,1,1) fn computeFn(){outer();}"`,
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

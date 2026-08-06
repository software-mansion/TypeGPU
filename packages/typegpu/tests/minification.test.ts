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
      "fn helper() -> i32 {
        return 1;
      }

      @compute @workgroup_size(1, 1, 1) fn computeFn() {
        helper();
      }"
    `);
    expect(code).toContain('  ');
  });

  it('minifies in resolve', async () => {
    const code = tgpu.resolve([inner], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }"
    `);
    expect(code).not.toContain('  ');
  });

  it('minifies in resolveWithContext', async () => {
    const code = tgpu.resolveWithContext([inner], { unstable_minify: true }).code;

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }"
    `);
    expect(code).not.toContain('  ');
  });

  it('minifies in old resolve', async () => {
    const code = tgpu.resolve({
      template: 'inner',
      externals: { inner },
      unstable_minify: true,
    });

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }inner"
    `);
    expect(code).not.toContain('  ');
  });

  it('minifies transitive dependencies in resolve', async () => {
    const code = tgpu.resolve([outer], { unstable_minify: true });

    expect(code).toMatchInlineSnapshot(`
      "fn inner() -> i32 {
        return 1;
      }

      fn outer() -> i32 {
        return inner();
      }"
    `);
    expect(code).not.toContain('  ');
  });

  it('minifies in resolve if root is set to minify', async () => {
    const root = await tgpu.init({ unstable_minify: true });
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

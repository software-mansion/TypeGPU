import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('unstable_stripJsImpl', () => {
  const code = `\
    import tgpu, { d } from 'typegpu';

    const add = (a, b) => {
      'use gpu';
      return a + b;
    };

    function kernel(x, y) {
      'use gpu';
      return add(x, y);
    }

    const shell = tgpu.fn([d.f32], d.f32)((v) => v * 2);

    console.log(add, kernel, shell);
  `;

  test('babel', () => {
    expect(babelTransform(code, { unstable_stripJsImpl: true })).toMatchInlineSnapshot(`
      "import { reviveFunction as __tgpu_revive } from 'typegpu/~internal';
      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      let kernel = /*#__PURE__*/__tgpu_meta(function kernel(a0, a1, ...r) {
        return (kernel.j ??= __tgpu_revive(kernel))(a0, a1, ...r);
      }, "[[\\"x\\",\\"y\\"],[[10,[6,\\"add\\",[\\"x\\",\\"y\\"]]]]]", {
        "add": () => add
      }, "kernel");
      import tgpu, { d } from 'typegpu';
      const add = /*#__PURE__*/__tgpu_meta(function __tgpu_stub(a0, a1, ...r) {
        return (__tgpu_stub.j ??= __tgpu_revive(__tgpu_stub))(a0, a1, ...r);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
      const shell = tgpu.fn([d.f32], d.f32)(/*#__PURE__*/__tgpu_meta(function __tgpu_stub(a0, ...r) {
        return (__tgpu_stub.j ??= __tgpu_revive(__tgpu_stub))(a0, ...r);
      }, "[[\\"v\\"],[[10,[1,\\"v\\",\\"*\\",2]]]]", {}));
      console.log(add, kernel, shell);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code, { unstable_stripJsImpl: true })).toMatchInlineSnapshot(`
      "import { reviveFunction } from 'typegpu/~internal';
      import tgpu, { d } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          let kernel = (/*#__PURE__*/__tgpu_meta(function kernel(a0, a1, ...r) { return (kernel.j ??= reviveFunction(kernel))(a0, a1, ...r); }, '[["x","y"],[[10,[6,"add",["x","y"]]]]]', {"add":() => add}, "kernel"));

          const add = (/*#__PURE__*/__tgpu_meta(function __tgpu_stub(a0, a1, ...r) { return (__tgpu_stub.j ??= reviveFunction(__tgpu_stub))(a0, a1, ...r); }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

          

          const shell = tgpu.fn([d.f32], d.f32)((/*#__PURE__*/__tgpu_meta(function __tgpu_stub(a0, ...r) { return (__tgpu_stub.j ??= reviveFunction(__tgpu_stub))(a0, ...r); }, '[["v"],[[10,[1,"v","*",2]]]]', {})));

          console.log(add, kernel, shell);
      "
    `);
  });
});

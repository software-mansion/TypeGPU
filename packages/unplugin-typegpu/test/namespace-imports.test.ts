import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { describe, expect, it } from 'vitest';
import { createUnpluginFactory } from '../src/core/factory.ts';
import esbuildPlugin from '../src/esbuild.ts';

const allSubpaths = new Set(['.', './tgpu', './data', './std', './common']);

function transform(
  code: string,
  { framework = 'esbuild', subpaths = allSubpaths } = {},
): string | undefined {
  const plugin = createUnpluginFactory({ getTypegpuSubpaths: () => subpaths })(
    { autoNamingEnabled: false },
    { framework: framework as 'esbuild' },
  );
  const result = plugin.transform.handler.call(
    {} as UnpluginBuildContext & UnpluginContext,
    code,
    '/project/main.ts',
  );
  return result?.code;
}

describe('namespace imports for esbuild and Bun', () => {
  it('imports namespaces from their subpaths', () => {
    expect(
      transform(`\
import { tgpu, d, std, common } from 'typegpu';
console.log(tgpu, d, std, common);`),
    ).toMatchInlineSnapshot(`
      "import 'typegpu';
      import * as tgpu from 'typegpu/tgpu';
      import * as d from 'typegpu/data';
      import * as std from 'typegpu/std';
      import * as common from 'typegpu/common';
      console.log(tgpu, d, std, common);"
    `);
  });

  it('keeps other specifiers, aliases and type imports in place', () => {
    expect(
      transform(`\
import t, { d as data, type TgpuRoot, isBuffer, type tgpu } from 'typegpu';
import type { std } from 'typegpu';
import { common } from 'typegpu/common';
export { tgpu as reexported } from 'typegpu';
console.log(t, data, isBuffer);`),
    ).toMatchInlineSnapshot(`
      "import { type TgpuRoot, isBuffer, type tgpu } from 'typegpu';
      import * as t from 'typegpu/tgpu';
      import * as data from 'typegpu/data';
      import type { std } from 'typegpu';
      import { common } from 'typegpu/common';
      export { tgpu as reexported } from 'typegpu';
      console.log(t, data, isBuffer);"
    `);
  });

  it('works next to hoisted functions', () => {
    expect(
      transform(`\
import { tgpu } from 'typegpu';
const add = tgpu.fn([])(() => {});
function foo() {
  'use gpu';
  return 1;
}`),
    ).toMatchInlineSnapshot(`
      "let foo = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function foo() {
        'use gpu';
        return 1;
      }), {
          v: 2,
          name: "foo",
          ast: {"params":[],"body":[0,[[10,[5,"1"]]]]},
          externals: {}
        }) && $.f)({}));

      import 'typegpu';
      import * as tgpu from 'typegpu/tgpu';
      const add = tgpu.fn([])((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {}), {
          v: 2,
          name: undefined,
          ast: {"params":[],"body":[0,[]]},
          externals: {}
        }) && $.f)({})));
      "
    `);
  });

  it('skips namespaces that the installed TypeGPU has no subpath for', () => {
    expect(
      transform(`import { tgpu, d } from 'typegpu';\nconsole.log(tgpu, d);`, {
        subpaths: new Set(['.', './data']),
      }),
    ).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';
      console.log(tgpu, d);"
    `);
  });

  it('leaves imports alone for bundlers that tree-shake re-exported namespaces', () => {
    expect(
      transform(`import { tgpu } from 'typegpu';\nconsole.log(tgpu);`, { framework: 'rollup' }),
    ).toBeUndefined();
  });
});

describe('esbuild tree-shaking', () => {
  const bundle = async (fixture: string, plugins = [esbuildPlugin()]) => {
    const result = await build({
      entryPoints: [
        fileURLToPath(new URL(`./fixtures/namespaceImports/${fixture}`, import.meta.url)),
      ],
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
      logLevel: 'silent',
      plugins,
    });
    return result.outputFiles[0]?.text ?? '';
  };

  it("drops unused members of namespaces imported from 'typegpu'", async () => {
    const fromSubpaths = await bundle('subpaths.ts');
    const fromBarrel = await bundle('barrel.ts');
    // Without the rewrite, esbuild bundles every member of `tgpu`, `d` and `std`
    const fromBarrelUntransformed = await bundle('barrel.ts', []);

    expect(fromBarrelUntransformed.length).toBeGreaterThan(fromSubpaths.length * 2);
    expect(fromBarrel.length).toBe(fromSubpaths.length);
  });
});

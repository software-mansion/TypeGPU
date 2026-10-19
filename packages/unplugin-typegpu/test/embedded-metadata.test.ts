import * as parser from '@babel/parser';
import _traverse, { type NodePath } from '@babel/traverse';
import type { Plugin } from 'rollup';
import { describe, expect, test } from 'vitest';
import { type BabelTestPlugin, babelTransform, rollupTransform } from './transform.ts';
import { type MetadatableFunction } from '../src/core/common.ts';
import {
  type EmbeddedTypegpuMetadata,
  getEmbeddedTypegpuMetadata,
} from '../src/core/embeddedMetadata.ts';

let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

function collectEmbeddedMetadata(
  path: NodePath<MetadatableFunction>,
  metadata: EmbeddedTypegpuMetadata[],
) {
  const embedded = getEmbeddedTypegpuMetadata(path);
  if (embedded) {
    metadata.push(embedded);
  }
}

function createBabelMetadataCollector(metadata: EmbeddedTypegpuMetadata[]): BabelTestPlugin {
  return {
    name: 'collect-typegpu-metadata',
    visitor: {
      ArrowFunctionExpression(path) {
        collectEmbeddedMetadata(path, metadata);
      },
      FunctionExpression(path) {
        collectEmbeddedMetadata(path, metadata);
      },
      FunctionDeclaration(path) {
        collectEmbeddedMetadata(path, metadata);
      },
    },
  };
}

function createRollupMetadataCollector(metadata: EmbeddedTypegpuMetadata[]): Plugin {
  return {
    name: 'collect-typegpu-metadata',
    transform(code) {
      const ast = parser.parse(code, { sourceType: 'module' });

      traverse(ast, {
        ArrowFunctionExpression(path) {
          collectEmbeddedMetadata(path, metadata);
        },
        FunctionExpression(path) {
          collectEmbeddedMetadata(path, metadata);
        },
        FunctionDeclaration(path) {
          collectEmbeddedMetadata(path, metadata);
        },
      });

      return undefined;
    },
  };
}

describe('collects embedded TypeGPU metadata', () => {
  const code = `\
    const fn1 = () => {
      'use gpu';
    };

    const fn2 = () => {
      'use gpu';
      'worklet';
    };

    const fn3 = () => {
      'worklet';
      'use gpu';
    };

    console.log(fn1, fn2, fn3);
  `;

  test('babel', () => {
    const metadata: EmbeddedTypegpuMetadata[] = [];

    babelTransform(code, undefined, [createBabelMetadataCollector(metadata)]);

    expect(JSON.stringify(metadata)).toMatchInlineSnapshot(
      `"[{"v":2,"name":"fn1"},{"v":2,"name":"fn2"},{"v":2,"name":"fn3"}]"`,
    );
  });

  test('rollup', async () => {
    const metadata: EmbeddedTypegpuMetadata[] = [];

    await rollupTransform(code, undefined, [createRollupMetadataCollector(metadata)]);

    expect(JSON.stringify(metadata)).toMatchInlineSnapshot(
      `"[{"v":2,"name":"fn1"},{"v":2,"name":"fn2"},{"v":2,"name":"fn3"}]"`,
    );
  });
});

describe('recognizes embedded TypeGPU metadata rewritten by other tools', () => {
  // A body that the plugin would fail to transpile (multiple declarations in one statement),
  // so re-transforming it would throw.
  const fn = `()=>{"use gpu";let a=1,b=2;return a+b}`;
  const meta = `{v:2,name:"fn",ast:{params:[],body:[0,[]]},externals:{}}`;

  const variants: Record<string, string> = {
    'original (??=)': `const fn=/*#__PURE__*/($=>(globalThis.__TYPEGPU_META__??=new WeakMap()).set($.f=${fn},${meta})&&$.f)({});`,
    'esbuild es2020 (?? + =)': `const fn=(e=>(globalThis.__TYPEGPU_META__??(globalThis.__TYPEGPU_META__=new WeakMap)).set(e.f=${fn},${meta})&&e.f)({});`,
    'esbuild es2019 (!= null ?:)': `const fn=(e=>{var a;return((a=globalThis.__TYPEGPU_META__)!=null?a:globalThis.__TYPEGPU_META__=new WeakMap).set(e.f=${fn},${meta})&&e.f})({});`,
    'babel preset-env (!== null && !== void 0 ?:)': `var fn=function($,_g){return((_g=globalThis.__TYPEGPU_META__)!==null&&_g!==void 0?_g:globalThis.__TYPEGPU_META__=new WeakMap()).set($.f=function(){"use gpu";let a=1,b=2;return a+b},${meta})&&$.f}({});`,
    'computed member access': `const fn=(e=>(globalThis["__TYPEGPU_META__"]??=new WeakMap).set((e.f=(${fn})),${meta})&&e.f)({});`,
  };

  describe.each(Object.entries(variants))('%s', (_label, code) => {
    test('babel', () => {
      const metadata: EmbeddedTypegpuMetadata[] = [];

      const output = babelTransform(`${code}\nconsole.log(fn);`, undefined, [
        createBabelMetadataCollector(metadata),
      ]);

      expect(metadata).toStrictEqual([{ v: 2, name: 'fn' }]);
      expect(output?.match(/__TYPEGPU_META__/g)?.length).toBe(
        code.match(/__TYPEGPU_META__/g)?.length,
      );
    });

    test('rollup', async () => {
      const metadata: EmbeddedTypegpuMetadata[] = [];

      const output = await rollupTransform(`${code}\nconsole.log(fn);`, undefined, [
        createRollupMetadataCollector(metadata),
      ]);

      expect(metadata).toStrictEqual([{ v: 2, name: 'fn' }]);
      expect(output.match(/__TYPEGPU_META__/g)?.length).toBe(
        code.match(/__TYPEGPU_META__/g)?.length,
      );
    });
  });

  test('does not treat unrelated .set calls as embedded metadata', () => {
    const output = babelTransform(
      `const m = new WeakMap(); const fn = ($ => m.set($.f = () => { 'use gpu'; }, ${meta}) && $.f)({});`,
    );

    // the function was not recognized as already transformed, so it got wrapped
    expect(output).toContain('__TYPEGPU_META__');
  });
});

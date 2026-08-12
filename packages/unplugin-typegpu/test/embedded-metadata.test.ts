import * as parser from '@babel/parser';
import _traverse, { type NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import type { Plugin } from 'rollup';
import { describe, expect, test } from 'vitest';
import { type BabelTestPlugin, babelTransform, rollupTransform } from './transform.ts';
import {
  type EmbeddedTypegpuMetadata,
  getEmbeddedTypegpuMetadata,
} from '../src/core/embeddedMetadata.ts';

let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

function collectEmbeddedMetadata(
  path: NodePath<t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration>,
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

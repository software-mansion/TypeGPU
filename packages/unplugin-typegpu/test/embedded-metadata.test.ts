import * as parser from '@babel/parser';
import _traverse, { type NodePath } from '@babel/traverse';
import type { Plugin } from 'rollup';
import { describe, expect, test } from 'vitest';
import { transpileBabelFn } from 'tinyest-for-wgsl';
import { type BabelTestPlugin, babelTransform, rollupTransform } from './transform.ts';
import type { MetadatableFunction } from '../src/core/common.ts';
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
      const ast = parser.parse(code, {
        sourceType: 'module',
        createParenthesizedExpressions: true, // to catch cases where `unwrapParentheses` or `parentPathSkippingParentheses` are needed
      });

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

/**
 * Traverses the program AST to extract the expected ASTs from functions containing 'use gpu' directive.
 *
 * @note For simplicity, shelled functions are omitted.
 */
function extractExpectedAstsFromSource(code: string) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  const expected: NonNullable<EmbeddedTypegpuMetadata['ast']>[] = [];

  function collect(path: NodePath<MetadatableFunction>) {
    const body = path.node.body;

    if (
      body.type !== 'BlockStatement' ||
      !body.directives.some((directive) => directive.value.value === 'use gpu')
    ) {
      return;
    }

    const { params, body: transpiledBody } = transpileBabelFn(path.node);
    expected.push({ params, body: transpiledBody });
  }

  traverse(ast, {
    ArrowFunctionExpression: collect,
    FunctionExpression: collect,
    FunctionDeclaration: collect,
  });

  return expected;
}

function dualTest(
  code: string,
  check: (
    metadata: EmbeddedTypegpuMetadata[],
    expectedAsts: NonNullable<EmbeddedTypegpuMetadata['ast']>[],
  ) => void,
) {
  test('[BABEL]', () => {
    const expectedAsts = extractExpectedAstsFromSource(code);

    const metadata: EmbeddedTypegpuMetadata[] = [];
    babelTransform(code, {}, [createBabelMetadataCollector(metadata)]);
    check(metadata, expectedAsts);
  });

  test('[ROLLUP]', async () => {
    const expectedAsts = extractExpectedAstsFromSource(code);

    const metadata: EmbeddedTypegpuMetadata[] = [];
    await rollupTransform(code, undefined, [createRollupMetadataCollector(metadata)]);
    check(metadata, expectedAsts);
  });
}

describe('getEmbeddedTypegpuMetadata', () => {
  describe('omits ast and externals fields for metadata v1', () => {
    const code = `\
      const fn = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';
        return 1;
      }, {
        v: 1,
        name: 'fn',
      }) && $.f)({});

      console.log(fn);
    `;

    dualTest(code, (metadata) => {
      expect(metadata).toStrictEqual([{ v: 1, name: 'fn' }]);
    });
  });

  describe.skip('parsers function parameters', () => {
    const code = `\
      const noParams = () => {
        'use gpu';
      };
  
      const identifierParams = (a, b) => {
        'use gpu';
        return a + b;
      };
  
      const destructuredParams = ({ pos, a: b }) => {
        'use gpu';
        return pos + b;
      };
  
      const mixedParams = (y, { pos, a: b }, { c, d }) => {
        'use gpu';
        return y + pos + b + c + d;
      };
  
      console.log(noParams, identifierParams, destructuredParams, mixedParams);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.params)).toStrictEqual(
        expectedAsts.map((ast) => ast.params),
      );
    });
  });

  describe('parses literals', () => {
    const code = `\
      const fn = () => {
        'use gpu';
        const numericLiteral = 1;
        const bigIntLiteral = 2n;
        const stringLiteral = 'text';
        const nullLiteral = null;
        const boolLiteral = true;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses blocks', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        let value = a;
        {
          value += 1;
          {
            value += 2;
          }
        }
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses binary expressions', () => {
    const code = `\
      const fn = (a, b) => {
        'use gpu';
        const plus = a + b;
        const xor = a ^ b;
        const eq = a === b;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses assignment expressions', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        let v = 0;
        v = a;
        v += a;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses logical expressions', () => {
    const code = `\
      const fn = (a, b) => {
        'use gpu';
        const and = a && b;
        const or = a || b;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses unary expressions', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        const negation = !a;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses call expressions', () => {
    const code = `\
      const fn = (f, a) => {
        'use gpu';
        const noArgs = f();
        const withArgs = f(a, 1);
        const nested = f(f(), a)
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses member and index access', () => {
    const code = `\
      const fn = (obj, arr, i) => {
        'use gpu';
        const member = obj.prop;
        const index = arr[i];
        const mixed = obj.a[i].b;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses return statements', () => {
    const code = `\
      const bareReturn = () => {
        'use gpu';
        return;
      };
  
      const valueReturn = (a) => {
        'use gpu';
        return a + 1;
      };
  
      console.log(bareReturn, valueReturn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses if statements', () => {
    const code = `\
      const bare = (a) => {
        'use gpu';
        if (a > 0) {
          return 1;
        }
      };
  
      const alternative = (a) => {
        'use gpu';
        if (a > 0) {
          return 1;
        } else {
          return 2;
        }
      };
  
      const elseIf = (a) => {
        'use gpu';
        if (a > 0) {
          return 1;
        } else if (a < 0) {
          return 2;
        } else {
          return 3;
        }
      };
  
      const withoutBlocks = (a) => {
        'use gpu';
        if (a > 0)
          return 1;
        else
          return 2;
      };
  
      console.log(bare, alternative, elseIf, withoutBlocks);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses variable declarations', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        let x = a;
        const y = a + 1;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses loops', () => {
    const code = `\
      const forLoop = (n) => {
        'use gpu';
        let total = 0;
        for (let i = 0; i < n; i++) {
          total += i;
        }
      };
  
      const whileLoop = (n) => {
        'use gpu';
        let total = 0;
        while (total < n) {
          total++;
        }
      };
  
      const forOfLoop = (items) => {
        'use gpu';
        let total = 0;
        for (const item of items) {
          total += item;
        }
      };
  
      console.log(forLoop, whileLoop, forOfLoop);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses break and continue', () => {
    const code = `\
      const fn = (n) => {
        'use gpu';
        let total = 0;
        let i = 1;
        while (true) {
          if (i % n === 0) {
            break;
          }
          if (i % n === 1) {
            continue;
          }
          total++
          i++;
        }
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses array expressions', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        const empty = [];
        const literals = [1, 2, 3];
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses post-update expressions', () => {
    const code = `\
      const fn = () => {
        'use gpu';
        let i = 0;
        i++;
        i--;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses object expressions', () => {
    const code = `\
      const fn = (a) => {
        'use gpu';
        const empty = {};
        const plain = { x: 1, y: a };
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses object expressions with computed properties', () => {
    const code = `\
      const fn = (id, f) => {
        'use gpu';
        const computed = { [id]: 1, [f()]: 2 };
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });

  describe('parses conditional expressions', () => {
    const code = `\
      const fn = (a, b) => {
        'use gpu';
        return a ? b : 1;
      };
  
      console.log(fn);
    `;

    dualTest(code, (metadata, expectedAsts) => {
      expect(metadata.map((m) => m.ast?.body)).toStrictEqual(expectedAsts.map((ast) => ast.body));
    });
  });
});

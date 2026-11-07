import { describe, expect } from 'vitest';
import * as d from '../../src/data/index.ts';
import * as tinyest from 'tinyest';
import { it } from 'typegpu-testing-utility';
import { getName, setName, type INTERNAL_GlobalExt } from '../../src/shared/meta.ts';
import { tgpu } from '../../src/index.js';
import {
  normalizeMetadata,
  type RawMetadata,
  type RawMetadataV1,
  type RawMetadataV2,
} from '../../src/shared/normalizeMetadata.ts';

// functions in this file intentionally have no 'use gpu' directive
describe('meta', () => {
  function assignMetadata(fn: object, meta: RawMetadata) {
    ((globalThis as INTERNAL_GlobalExt).__TYPEGPU_META__ ??= new WeakMap()).set(fn, meta);
  }
  const NODE = tinyest.NodeTypeCatalog;

  describe('normalization', () => {
    it('throws a readable error when metadata is missing', () => {
      const fn = () => {};

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>: Value () => {} is not resolvable]
      `);
    });

    it('correctly parses externals v1', () => {
      const EXT = { N: tgpu.const(d.u32, 1) };
      const fn = () => {
        let a = EXT.N.$;
      };
      const meta: RawMetadataV1 = {
        v: 1,
        name: 'fn',
        externals: { EXT },
        ast: {
          params: [],
          body: [
            NODE.block,
            [[NODE.let, 'a', [NODE.memberAccess, [NODE.memberAccess, 'EXT', 'N'], '$']]],
          ],
          externalNames: ['EXT'],
        },
      };
      assignMetadata(fn, meta);

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "const N: u32 = 1u;

        fn fn_1() {
          let a = N;
        }"
      `);
    });

    it('correctly parses deferred externals v1', () => {
      const EXT = { N: tgpu.const(d.u32, 1) };
      const fn = () => {
        let a = EXT.N.$;
      };
      const meta: RawMetadataV1 = {
        v: 1,
        name: 'fn',
        externals: () => ({ EXT }),
        ast: {
          params: [],
          body: [
            NODE.block,
            [[NODE.let, 'a', [NODE.memberAccess, [NODE.memberAccess, 'EXT', 'N'], '$']]],
          ],
          externalNames: ['EXT'],
        },
      };
      assignMetadata(fn, meta);

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "const N: u32 = 1u;

        fn fn_1() {
          let a = N;
        }"
      `);
    });

    it('correctly parses deferred externals v2', () => {
      const EXT = { O: { N: tgpu.const(d.u32, 1) } };
      const fn = () => {
        let a = EXT.O.N.$;
      };
      const meta: RawMetadataV2 = {
        v: 2,
        name: 'fn',
        externals: { 'EXT.O.N': () => EXT.O.N },
        ast: {
          params: [],
          body: [NODE.block, [[NODE.let, 'a', [NODE.memberAccess, 'EXT.O.N', '$']]]],
        },
      };
      assignMetadata(fn, meta);

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "const N: u32 = 1u;

        fn fn_1() {
          let a = N;
        }"
      `);
    });

    describe.each([1, 2] as const)('legacy v%i parameters', (version) => {
      function legacyMetadata(
        params: tinyest.LegacyFuncParameter[],
        body: tinyest.Block,
      ): RawMetadata {
        return version === 1
          ? { v: 1, name: 'fn', externals: {}, ast: { params, body, externalNames: [] } }
          : { v: 2, name: 'fn', externals: {}, ast: { params, body } };
      }

      it('normalizes parameters without changing the input metadata or body', () => {
        const params: tinyest.LegacyFuncParameter[] = [
          { type: 'i', name: 'offset' },
          {
            type: 'd',
            props: [
              { name: 'x', alias: 'first' },
              { name: 'y', alias: 'y' },
            ],
          },
          { type: 'd', props: [] },
        ];
        const body: tinyest.Block = [NODE.block, [[NODE.return, 'offset']]];
        const meta = legacyMetadata(params, body);
        const original = structuredClone(meta);

        const normalized = normalizeMetadata(meta);

        expect(normalized.ast.params).toStrictEqual([
          'offset',
          [
            NODE.objectPattern,
            [
              ['x', 'first'],
              ['y', 'y'],
            ],
          ],
          [NODE.objectPattern, []],
        ]);
        expect(normalized.ast.body).toBe(body);
        expect(meta).toStrictEqual(original);
        expect(meta.ast.params).toBe(params);
      });

      it('resolves named parameters and destructuring aliases to WGSL', () => {
        const implementation = (offset: number, { x: first, y }: d.v2f) => offset + first + y;
        assignMetadata(
          implementation,
          legacyMetadata(
            [
              { type: 'i', name: 'offset' },
              {
                type: 'd',
                props: [
                  { name: 'x', alias: 'first' },
                  { name: 'y', alias: 'y' },
                ],
              },
            ],
            [
              NODE.block,
              [
                [
                  NODE.return,
                  [NODE.binaryExpr, [NODE.binaryExpr, 'offset', '+', 'first'], '+', 'y'],
                ],
              ],
            ],
          ),
        );
        const fn = tgpu.fn([d.f32, d.vec2f], d.f32)(implementation).$name('sum');

        expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
          "fn sum(offset: f32, _arg_1: vec2f) -> f32 {
            return ((offset + _arg_1.x) + _arg_1.y);
          }"
        `);
      });
    });

    it('preserves current v2 parameters while normalizing legacy parameters in the same list', () => {
      const identifier: tinyest.Identifier = [NODE.identifier, 'mapped'];
      const pattern: tinyest.ObjectPattern = [NODE.objectPattern, [['position', 'pos']]];
      const emptyPattern: tinyest.ObjectPattern = [NODE.objectPattern, []];
      const body: tinyest.Block = [
        NODE.block,
        [[NODE.const, [NODE.identifier, 'local'], [NODE.numericLiteral, '1']]],
      ];
      const meta: RawMetadataV2 = {
        v: 2,
        name: 'fn',
        externals: {},
        ast: {
          params: [
            'plain',
            { type: 'i', name: 'legacy' },
            identifier,
            { type: 'd', props: [{ name: 'x', alias: 'first' }] },
            pattern,
            emptyPattern,
          ],
          body,
        },
      };
      const original = structuredClone(meta);

      const normalized = normalizeMetadata(meta);

      expect(normalized.ast.params).toStrictEqual([
        'plain',
        'legacy',
        identifier,
        [NODE.objectPattern, [['x', 'first']]],
        pattern,
        emptyPattern,
      ]);
      expect(normalized.ast.params[2]).toBe(identifier);
      expect(normalized.ast.params[4]).toBe(pattern);
      expect(normalized.ast.params[5]).toBe(emptyPattern);
      expect(normalized.ast.body).toBe(body);
      expect(meta).toStrictEqual(original);
    });

    it('throws a readable error when metadata version is not recognized', () => {
      const fn = () => {};
      assignMetadata(fn, {} as RawMetadata);

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>: Unrecognized TypeGPU metadata format: {}]
      `);
    });

    it('prefers assigned name over metadata', () => {
      const fn = () => {};

      setName(fn, 'newName');
      const meta: RawMetadataV1 = {
        v: 1,
        name: 'oldName',
        externals: () => ({}),
        ast: {
          params: [],
          body: [NODE.block, []],
          externalNames: [],
        },
      };
      assignMetadata(fn, meta);

      expect(getName(fn)).toBe('newName');
    });

    it('allows variable recapture for v1', () => {
      let a = 1;
      const fn = () => {
        return a;
      };

      const meta: RawMetadataV1 = {
        v: 1,
        name: 'fn',
        externals: () => ({ a }),
        ast: {
          params: [],
          body: [NODE.block, [[NODE.return, 'a']]],
          externalNames: ['a'],
        },
      };
      assignMetadata(fn, meta);

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          return 1;
        }"
      `);

      a = 2;
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          return 2;
        }"
      `);
    });

    it('allows variable recapture for v2', () => {
      let a = 1;
      const fn = () => {
        return a;
      };

      const meta: RawMetadataV2 = {
        v: 2,
        name: 'fn',
        externals: { a: () => a },
        ast: {
          params: [],
          body: [NODE.block, [[NODE.return, 'a']]],
        },
      };
      assignMetadata(fn, meta);

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          return 1;
        }"
      `);

      a = 2;
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          return 2;
        }"
      `);
    });
  });

  it('correctly handles bool node', () => {
    const fn = () => {};
    const meta: RawMetadataV2 = {
      v: 2,
      name: 'fn',
      externals: {},
      ast: {
        params: [],
        body: [NODE.block, [[NODE.let, 'a', [NODE.booleanLiteral, true]]]],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let a = true;
      }"
    `);
  });

  it('correctly handles ident node', () => {
    const fn = () => {};
    const meta: RawMetadataV2 = {
      v: 2,
      name: 'fn',
      externals: { c: () => ({ d: 1 }) },
      ast: {
        params: [],
        body: [
          NODE.block,
          [
            [NODE.let, [NODE.identifier, 'a'], [NODE.numericLiteral, '1']],
            [NODE.const, [NODE.identifier, 'b'], [NODE.numericLiteral, '1']],
            [NODE.memberAccess, [NODE.identifier, 'c'], [NODE.identifier, 'd']],
          ],
        ],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let a = 1;
        const b = 1;
        1;
      }"
    `);
  });

  it('correctly unwraps ident node', () => {
    const fn = () => {};
    const meta: RawMetadataV2 = {
      v: 2,
      name: 'fn',
      externals: { c: () => ({ d: 1 }) },
      ast: {
        params: [],
        body: [
          NODE.block,
          [
            [NODE.let, [NODE.identifier, 'a'], [NODE.numericLiteral, '1']],
            [NODE.assignmentExpr, [NODE.identifier, 'a'], '=', [NODE.numericLiteral, '1']],
          ],
        ],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 1;
        a = 1i;
      }"
    `);
  });

  it('correctly handles invalid identifiers', () => {
    const fn = () => {};
    const meta: RawMetadataV2 = {
      v: 2,
      name: 'fn',
      externals: {},
      ast: {
        params: [],
        body: [
          NODE.block,
          [
            [NODE.let, 'fn', [NODE.numericLiteral, '1']],
            [NODE.let, 'if', [NODE.numericLiteral, '1']],
            [NODE.let, 'for', [NODE.numericLiteral, '1']],
            [NODE.let, 'let', [NODE.numericLiteral, '1']],
            [NODE.let, 'var', [NODE.numericLiteral, '1']],
          ],
        ],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let fn_2 = 1;
        let if_1 = 1;
        let for_1 = 1;
        let let_1 = 1;
        let var_1 = 1;
      }"
    `);
  });
});

import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import * as tinyest from 'tinyest';
import { it } from 'typegpu-testing-utility';
import type { INTERNAL_GlobalExt } from '../src/shared/meta.ts';
import { tgpu } from '../src/index.js';
import type { RawMetadata, RawMetadataV1, RawMetadataV2 } from '../src/shared/normalizeMetadata.ts';

describe('meta', () => {
  function assignMetadata(fn: object, meta: RawMetadata) {
    ((globalThis as INTERNAL_GlobalExt).__TYPEGPU_META__ ??= new WeakMap()).set(fn, meta);
  }
  const NODE = tinyest.NodeTypeCatalog;

  it('throws a readable error when metadata is missing', () => {
    const fn = () => {
      'use gpu';
    };
    assignMetadata(fn, { v: 1 });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>: Value () => {
      			"use gpu";
      		} is not resolvable]
    `);
  });

  it('correctly parses externals v1', () => {
    const EXT = { N: tgpu.const(d.u32, 1) };
    const fn = () => {
      'use gpu';
      let a = EXT.N.$;
    };
    const meta: RawMetadataV1 = {
      v: 1,
      name: 'fn',
      externals: { EXT },
      ast: {
        params: [],
        body: [NODE.block, [[NODE.let, 'a', [NODE.memberAccess, [NODE.memberAccess, 'EXT', 'N'], '$']]]],
        externalNames: ['EXT'],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "const N: u32 = 1u;

      fn fn_1() {
        var a = N;
      }"
    `);
  });

  it('correctly parses deferred externals v1', () => {
    const EXT = { N: tgpu.const(d.u32, 1) };
    const fn = () => {
      'use gpu';
      let a = EXT.N.$;
    };
    const meta: RawMetadataV1 = {
      v: 1,
      name: 'fn',
      externals: () => ({ EXT }),
      ast: {
        params: [],
        body: [NODE.block, [[NODE.let, 'a', [NODE.memberAccess, [NODE.memberAccess, 'EXT', 'N'], '$']]]],
        externalNames: ['EXT'],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "const N: u32 = 1u;

      fn fn_1() {
        var a = N;
      }"
    `);
  });

  it('correctly parses deferred externals v2', () => {
    const EXT = { N: tgpu.const(d.u32, 1) };
    const fn = () => {
      'use gpu';
      let a = EXT.N.$;
    };
    const meta: RawMetadataV2 = {
      v: 2,
      name: 'fn',
      externals: { EXT: { N: { $: () => EXT.N.$ } } },
      ast: {
        params: [],
        body: [NODE.block, [[NODE.let, 'a', [NODE.memberAccess, [NODE.memberAccess, 'EXT', 'N'], '$']]]],
        externalNames: ['EXT'],
      },
    };
    assignMetadata(fn, meta);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "const N: u32 = 1u;

      fn fn_1() {
        var a = N;
      }"
    `);
  });

  it('throws a readable error when metadata version is not recognized', () => {
    const fn = () => {
      'use gpu';
    };
    assignMetadata(fn, {} as RawMetadata);

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>: Unrecognized TypeGPU metadata format: {}]
    `);
  });
});

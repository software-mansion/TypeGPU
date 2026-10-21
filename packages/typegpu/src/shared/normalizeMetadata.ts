import * as tinyest from 'tinyest';
import type { Block, FuncParameter, Statement } from 'tinyest';
import { safeStringify } from './stringify.ts';

const { NodeTypeCatalog, FuncParameterType } = tinyest;

export interface RawMetadataV1 {
  v: 1;
  name: string;
  ast: { params: FuncParameter[]; body: Block; externalNames: string[] };
  externals:
    // Passing a record happens prior to version 0.9.0
    Record<string, unknown> | (() => Record<string, unknown>);
}

export interface RawMetadataV2 {
  v: 2;
  name: string;
  ast: { params: FuncParameter[]; body: Block };
  externals: { [key: string]: () => unknown };
}

/**
 * Registered by a helper that unplugin-typegpu declares once per module:
 * `__tgpu_meta(fn, json, externals, name?)`.
 * - `json` holds `[params, statements]`, and is only parsed when the function is first used
 * - identifier params are plain strings, destructured params are `[name, alias][]`
 * - numeric literals are plain numbers where possible
 */
export type RawMetadataV3 = readonly [
  json: string,
  externals: { [key: string]: () => unknown },
  name?: string,
];

/**
 * Holds all function info collected by typegpu-unplugin
 */
export type RawMetadata = RawMetadataV1 | RawMetadataV2 | RawMetadataV3;

function isRawMetadataV3(meta: RawMetadata): meta is RawMetadataV3 {
  return Array.isArray(meta);
}

export function rawMetadataName(meta: RawMetadata): string | undefined {
  return isRawMetadataV3(meta) ? meta[2] : meta.name;
}

/**
 * Holds normalized function metadata required for WGSL generation
 */
export interface Metadata {
  ast: { params: FuncParameter[]; body: Block };
  externals: () => Record<string, unknown>;
}

/**
 * The values of ExternalsV2 are zero-argument functions for accessing the value.
 * Since they would be recognized by the WgslGenerator as regular, non 'use gpu' functions,
 * we turn them into getters.
 *
 * @example
 * normalizeExternalsV2({ "ext.prop": () => ext.prop; }); // { get "ext.prop"() => ext.prop; }
 */
function normalizeExternalsV2(externals: RawMetadataV2['externals']): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(externals)) {
    Object.defineProperty(result, key, { get: value, enumerable: true });
  }
  return result;
}

export function normalizeMetadata(meta: RawMetadata): Metadata {
  if (isRawMetadataV3(meta)) {
    const [json, rawExternals] = meta;
    const [params, statements] = JSON.parse(json) as [(string | [string, string][])[], Statement[]];
    const externals = normalizeExternalsV2(rawExternals);
    return {
      ast: {
        params: params.map((p) =>
          typeof p === 'string'
            ? { type: FuncParameterType.identifier, name: p }
            : {
                type: FuncParameterType.destructuredObject,
                props: p.map(([name, alias]) => ({ name, alias })),
              },
        ),
        body: [NodeTypeCatalog.block, statements],
      },
      externals: () => externals,
    };
  }

  if (meta.v === 1) {
    const rawExternals = meta.externals;
    const externals = typeof rawExternals === 'function' ? rawExternals : () => rawExternals;
    return { ...meta, externals };
  }

  if (meta.v === 2) {
    const externals = normalizeExternalsV2(meta?.externals);
    return { ...meta, externals: () => externals };
  }

  throw new Error(`Unrecognized TypeGPU metadata format: ${safeStringify(meta)}`);
}

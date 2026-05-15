import type { Block, FuncParameter } from 'tinyest';
import { safeStringify } from './stringify.ts';

export interface RawMetadataV1 {
  v: 1;
  name?: string;
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] };
  externals?:
    // Passing a record happens prior to version 0.9.0
    Record<string, unknown> | (() => Record<string, unknown>);
}

interface ExternalsV2 {
  [key: string]: ExternalsV2 | (() => unknown);
}

export interface RawMetadataV2 {
  v: 2;
  name?: string;
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] };
  externals?: ExternalsV2;
}

/**
 * Holds all function info collected by typegpu-unplugin
 */
export type RawMetadata = RawMetadataV1 | RawMetadataV2;

/**
 * Holds normalized function metadata required for WGSL generation
 */
export interface Metadata {
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] } | undefined;
  externals?: Record<string, unknown> | undefined;
}

/**
 * The values of ExternalsV2 are zero-argument functions for accessing the value.
 * Since they would be recognized by the wgslGenerator as regular, non 'use gpu' functions,
 * we turn them into getters.
 *
 * @example
 * normalizeExternalsV2({ ext: { prop: () => ext.prop; }}); // { ext: { prop: [Getter] } }
 */
function normalizeExternalsV2(externals: ExternalsV2): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(externals)) {
    if (typeof value === 'function') {
      Object.defineProperty(result, key, { get: value, enumerable: true });
    } else {
      result[key] = normalizeExternalsV2(value);
    }
  }
  return result;
}

export function normalizeMetadata(meta: RawMetadata): Metadata {
  if (meta.v === 1) {
    const externals = typeof meta?.externals === 'function' ? meta.externals() : meta?.externals;
    return { ...meta, externals };
  }

  if (meta.v === 2) {
    const externals = meta?.externals ? normalizeExternalsV2(meta?.externals) : undefined;
    return { ...meta, externals };
  }

  throw new Error(`Unrecognized TypeGPU metadata format: ${safeStringify(meta)}`);
}

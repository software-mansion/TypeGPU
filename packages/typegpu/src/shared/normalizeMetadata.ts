import type { BindingPattern, Block, FuncParameter, LegacyFuncParameter } from 'tinyest';
import { NodeTypeCatalog } from 'tinyest';
import { safeStringify } from './stringify.ts';

export interface RawMetadataV1 {
  v: 1;
  name: string;
  ast: { params: LegacyFuncParameter[]; body: Block; externalNames: string[] };
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
 * Holds all function info collected by typegpu-unplugin
 */
export type RawMetadata = RawMetadataV1 | RawMetadataV2;

/**
 * Holds normalized function metadata required for WGSL generation
 */
export interface Metadata {
  ast: { params: BindingPattern[]; body: Block };
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
  if (meta.v === 1) {
    const rawExternals = meta.externals;
    const externals = typeof rawExternals === 'function' ? rawExternals : () => rawExternals;
    return {
      ...meta,
      ast: { ...meta.ast, params: meta.ast.params.map(normalizeParameter) },
      externals,
    };
  }

  if (meta.v === 2) {
    const externals = normalizeExternalsV2(meta.externals);
    return {
      ...meta,
      ast: { ...meta.ast, params: meta.ast.params.map(normalizeParameter) },
      externals: () => externals,
    };
  }

  throw new Error(`Unrecognized TypeGPU metadata format: ${safeStringify(meta)}`);
}

function normalizeParameter(param: FuncParameter): BindingPattern {
  // Only legacy parameters have a `type` property.
  if (typeof param === 'string' || !('type' in param)) {
    return param;
  }

  if (param.type === 'i') {
    return param.name;
  }

  return [
    NodeTypeCatalog.objectPattern,
    param.props.map(({ name, alias }): [string, string] => [name, alias]),
  ];
}

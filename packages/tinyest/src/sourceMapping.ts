import type { AnyNode, SourceMap, SourceMappedNode } from './nodes.ts';

export const SourceMapNodeType = -1;

function map<T extends readonly unknown[]>(arr: T, line: number, column: number): T {
  return [SourceMapNodeType, line, column, arr] as unknown as T;
}

/**
 * Returns a new node with embedded source map.
 *
 * Only array nodes will be mapped, this means that
 * identifier and boolean won't be mapped unless they are in array form.
 *
 * Use {@link stripSourceMap} to restore node and sourceMap.
 */
export function embedSourceMap(node: AnyNode, sourceMap: SourceMap): SourceMappedNode {
  function embed<T>(item: T): T {
    let result: T;

    if (Array.isArray(item)) {
      result = item.map((elem) => embed(elem)) as T;
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      result = Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [key, embed(value)]),
      ) as T;
    } else {
      result = item;
    }

    if (Array.isArray(result) && Array.isArray(item)) {
      const maybeSource = sourceMap.get(item);
      if (maybeSource) {
        return map(result, ...maybeSource);
      }
    }

    return result;
  }

  return embed(node) as unknown as SourceMappedNode;
}

/**
 * Use this function to split SourceMappedNode into AnyNode and SourceMap.
 * It is not recommended to strip source maps in any other way.
 */
export function stripSourceMap(
  node: SourceMappedNode | AnyNode,
): [node: AnyNode, sourceMap: SourceMap] {
  const sourceMap: SourceMap = new Map();

  function strip(item: unknown): unknown {
    // item can be a source mapped node, a regular node, or anything that appears inside nodes,
    // e.g. ObjectProperty[], or Record<string, Expression>.

    if (typeof item !== 'object') {
      return item;
    }

    if (Array.isArray(item) && item[0] === SourceMapNodeType) {
      const [, line, column, inner] = item;
      const stripped = strip(inner) as AnyNode;
      if (Array.isArray(stripped)) {
        sourceMap.set(stripped, [line, column]);
      }
      return stripped;
    }

    if (Array.isArray(item)) {
      return item.map(strip);
    } else if (item) {
      const obj = item as Record<string, unknown>;
      return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, strip(value)]));
    }

    return item;
  }

  return [strip(node) as AnyNode, sourceMap];
}

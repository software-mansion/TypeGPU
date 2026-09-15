import { type AnyNode, type SourceMap, type SourceMappedNode } from './nodes.ts';

/**
 * This is not a correct type for a source mapped node,
 * as it implies that nested nodes are not source mapped.
 */
type FlatSourceMappedNode = [type: -1, line: number, column: number, node: AnyNode];

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

    if (Array.isArray(item) && item[0] === -1) {
      const [, line, column, inner] = item as FlatSourceMappedNode;
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

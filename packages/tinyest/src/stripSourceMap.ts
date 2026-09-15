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

  function stripNode(node: unknown): unknown {
    // Node can be a source mapped node, a regular node, or anything that appears inside nodes,
    // e.g. ObjectProperty[], or Record<string, Expression>.

    if (typeof node !== 'object') {
      return node;
    }

    if (Array.isArray(node) && node[0] === -1) {
      const [, line, column, inner] = node as FlatSourceMappedNode;
      const stripped = stripNode(inner) as AnyNode;
      if (Array.isArray(stripped)) {
        sourceMap.set(stripped, [line, column]);
      }
      return stripped;
    }

    if (Array.isArray(node)) {
      return node.map(stripNode);
    } else if (node) {
      const obj = node as Record<string, unknown>;
      return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, stripNode(value)]));
    }

    return node;
  }

  return [stripNode(node) as AnyNode, sourceMap];
}

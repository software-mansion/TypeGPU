import {
  NodeTypeCatalog,
  type AnyNode,
  type MappableNode,
  type SourceMap,
  type SourceMappedNode,
} from './nodes.ts';

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

  // Source mapped node
  function stripNode(node: AnyNode | FlatSourceMappedNode): AnyNode {
    if (Array.isArray(node) && node[0] === -1) {
      // souce map node
      const [, line, column, inner] = node;
      const stripped = stripNode(inner);
      if (Array.isArray(stripped)) {
        sourceMap.set(stripped as MappableNode, [line, column]);
      }
      return stripped;
    }

    if (Array.isArray(node)) {
      for (let i = 1 /* skip node type */; i < node.length; i++) {
        if (Array.isArray(node[i])) {
          node[i] = stripNode(node[i]);
        } else if (typeof node[i] === 'object') {
          // We need to recurse into objects in ObjectExpr as well.
          const obj = node[i];
          for (const key of Object.keys(obj)) {
            obj[key] = stripNode(obj[key]);
          }
        }
      }
    }

    return node;
  }

  return [stripNode(node as Parameters<typeof stripNode>[0]), sourceMap];
}

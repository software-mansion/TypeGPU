import * as tinyest from 'tinyest';
import type { AnyNode, SourceMappedNode } from 'tinyest';
import type { MappableNode, SourceMapEntry } from './types.ts';

//// eeeej mozna robic tak ze ta mapa bedzie trzymac stos dla kazdego prymitywa
// troche fragile ale moze przejdzie

const { NodeTypeCatalog: NODE } = tinyest;

type NodeSourceMap = Map<MappableNode, SourceMapEntry>;

function isObjectExpression(node: readonly unknown[]): boolean {
  return node[0] === NODE.objectExpr;
}

function isSourceMapNode(node: readonly unknown[]): boolean {
  return node[0] === NODE.sourceMap;
}

/**
 * Recursively wraps nodes for which `nodeSourceMap` holds an entry
 * in `[NODE.sourceMap, node, line, column]` nodes.
 *
 * Descends into every nested array, which covers both nodes and lists of nodes
 * (like statements of a block, or arguments of a call).
 */
export function addSourceMap(node: AnyNode, nodeSourceMap: NodeSourceMap): SourceMappedNode {
  if (!Array.isArray(node)) {
    // Identifiers and boolean literals cannot be wrapped.
    return node;
  }

  let mapped: unknown[];
  if (isObjectExpression(node)) {
    // Properties of an object expression are held in a record, not in an array,
    // so they have to be traversed separately.
    const props = node[1] as Record<string, AnyNode>;
    mapped = [
      NODE.objectExpr,
      Object.fromEntries(
        Object.entries(props).map(([key, value]) => [key, addSourceMap(value, nodeSourceMap)]),
      ),
    ];
  } else {
    mapped = node.map((element) =>
      Array.isArray(element) ? addSourceMap(element as unknown as AnyNode, nodeSourceMap) : element,
    );
  }

  const entry = nodeSourceMap.get(node as MappableNode);
  return entry
    ? [NODE.sourceMap, mapped as unknown as SourceMappedNode, entry[0], entry[1]]
    : (mapped as unknown as AnyNode);
}

/**
 * Inverse of {@link addSourceMap} -- removes all `NODE.sourceMap` wrappers,
 * collecting the source information into a map keyed by the stripped nodes.
 */
export function stripSourceMap(
  node: SourceMappedNode,
): [nodeSourceMap: NodeSourceMap, strippedNode: AnyNode] {
  const nodeSourceMap: NodeSourceMap = new Map();
  const strippedNode = strip(node, nodeSourceMap);
  return [nodeSourceMap, strippedNode];
}

function strip(node: SourceMappedNode, nodeSourceMap: NodeSourceMap): AnyNode {
  let entry: SourceMapEntry;
  let unwrapped: SourceMappedNode = node;

  while (Array.isArray(unwrapped) && isSourceMapNode(unwrapped)) {
    const [, inner, line, column] = unwrapped as [number, SourceMappedNode, number, number];
    entry = [line, column];
    unwrapped = inner;
  }

  if (!Array.isArray(unwrapped)) {
    return unwrapped;
  }

  let stripped: unknown[];
  if (isObjectExpression(unwrapped)) {
    const props = unwrapped[1] as unknown as Record<string, SourceMappedNode>;
    stripped = [
      NODE.objectExpr,
      Object.fromEntries(
        Object.entries(props).map(([key, value]) => [key, strip(value, nodeSourceMap)]),
      ),
    ];
  } else {
    stripped = unwrapped.map((element) =>
      Array.isArray(element) ? strip(element as SourceMappedNode, nodeSourceMap) : element,
    );
  }

  if (entry) {
    nodeSourceMap.set(stripped as unknown as MappableNode, entry);
  }

  return stripped as unknown as AnyNode;
}

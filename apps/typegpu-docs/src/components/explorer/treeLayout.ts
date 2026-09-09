import type { TraceNode } from './trace.ts';

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 88;
const GAP_X = 28;
const GAP_Y = 64;

export interface PositionedNode {
  node: TraceNode;
  x: number;
  y: number;
}

/** Allocate disjoint horizontal spans to sibling subtrees, then center each parent. */
export function layoutTree(nodes: TraceNode[]) {
  const children = new Map<number | null, TraceNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  const widths = new Map<number, number>();
  // Trace IDs follow entry order, so children always follow their parents.
  for (const node of nodes.toReversed()) {
    const descendants = children.get(node.id) ?? [];
    widths.set(
      node.id,
      Math.max(
        NODE_WIDTH,
        descendants.reduce((sum, child) => sum + (widths.get(child.id) ?? NODE_WIDTH), 0) +
          Math.max(0, descendants.length - 1) * GAP_X,
      ),
    );
  }
  const positioned: PositionedNode[] = [];
  const pending = (children.get(null) ?? []).map((node) => ({ node, left: 0, depth: 0 }));
  let rootLeft = 0;
  for (const root of pending) {
    root.left = rootLeft;
    rootLeft += (widths.get(root.node.id) ?? NODE_WIDTH) + GAP_X;
  }
  let height = NODE_HEIGHT;
  while (pending.length) {
    const item = pending.pop();
    if (!item) break;
    const { node, left, depth } = item;
    const width = widths.get(node.id) ?? NODE_WIDTH;
    const y = depth * (NODE_HEIGHT + GAP_Y);
    positioned.push({ node, x: left + (width - NODE_WIDTH) / 2, y });
    height = Math.max(height, y + NODE_HEIGHT);
    let childLeft = left;
    for (const child of children.get(node.id) ?? []) {
      pending.push({ node: child, left: childLeft, depth: depth + 1 });
      childLeft += (widths.get(child.id) ?? NODE_WIDTH) + GAP_X;
    }
  }
  return {
    nodes: positioned.toSorted((a, b) => a.node.id - b.node.id),
    width: Math.max(NODE_WIDTH, rootLeft - GAP_X),
    height,
  };
}

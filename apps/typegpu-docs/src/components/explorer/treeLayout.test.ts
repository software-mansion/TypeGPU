import { expect, it } from 'vitest';
import { layoutTree, NODE_WIDTH, NODE_HEIGHT } from './treeLayout.ts';
import type { TraceNode } from './trace.ts';

const node = (id: number, parent: number | null): TraceNode => ({
  id,
  parent,
  kind: 'expression',
  label: String(id),
  node: '',
  output: '',
  step: id + 1,
});

it('centers parents over disjoint sibling subtrees and routes children below them', () => {
  const source = [node(0, null), node(1, 0), node(2, 1), node(3, 1), node(4, 0), node(5, 4)];
  const result = layoutTree(source);
  const byId = new Map(result.nodes.map((item) => [item.node.id, item]));
  const root = byId.get(0)!;
  expect(root.x + NODE_WIDTH / 2).toBe(result.width / 2);
  for (const item of result.nodes) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.x + NODE_WIDTH).toBeLessThanOrEqual(result.width);
    expect(item.y + NODE_HEIGHT).toBeLessThanOrEqual(result.height);
    if (item.node.parent !== null)
      expect(item.y).toBeGreaterThan(byId.get(item.node.parent)!.y + NODE_HEIGHT);
    for (const other of result.nodes) {
      if (other.node.id > item.node.id && other.y === item.y) {
        expect(Math.abs(other.x - item.x)).toBeGreaterThan(NODE_WIDTH);
      }
    }
  }
});

it('lays out multiple exported roots separately, including a single-node tree', () => {
  const result = layoutTree([node(0, null), node(1, null), node(2, 1)]);
  expect(result.nodes[1].x).toBeGreaterThan(result.nodes[0].x + NODE_WIDTH);
  expect(layoutTree([node(0, null)])).toMatchObject({ width: NODE_WIDTH, height: NODE_HEIGHT });
});

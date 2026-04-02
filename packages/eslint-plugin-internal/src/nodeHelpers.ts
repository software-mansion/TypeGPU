import { TSESTree } from '@typescript-eslint/utils';

const transparentNodes = [
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
];

export function isTransparent(node: TSESTree.Node): boolean {
  return transparentNodes.includes(node.type);
}

export function getNonTransparentParent(node: TSESTree.Node) {
  let parent = node.parent;
  while (parent && isTransparent(parent)) {
    parent = parent.parent;
  }
  return parent;
}

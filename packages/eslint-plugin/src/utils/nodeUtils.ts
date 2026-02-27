import { TSESTree } from '@typescript-eslint/utils';

/**
 * Retrieves the base object from a property access chain.
 * Also considers array access.
 *
 * @example
 * // for simplicity, using code snippets instead of ASTs
 * getBaseFromAccessChain('a'); // a
 * getBaseFromAccessChain('d.u32'); // d
 * getBaseFromAccessChain('myObj.prop.prop'); // myObj
 * getBaseFromAccessChain("myObj['prop']""); // myObj TODO: actually implement this
 */
export function getBaseFromAccessChain(node: TSESTree.Node) {
  let result: TSESTree.Node = node;
  while (result.type === 'MemberExpression') {
    result = result.object;
  }
  return result;
}

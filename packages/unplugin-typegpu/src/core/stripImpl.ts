import * as t from '@babel/types';
import type { MetadatableFunction } from './common.ts';

/**
 * EXPERIMENT (`unstable_stripJsImpl`): the JS implementation of 'use gpu' functions is replaced
 * with a stub, and recreated from the function's AST the first time it's called on the CPU.
 */
const REVIVE = '__tgpu_revive';

export const reviveImportDeclaration = `import { reviveFunction as ${REVIVE} } from 'typegpu/~internal';\n`;

/**
 * Keeps the original `.length`, since TypeGPU relies on it (e.g. guarded compute pipelines
 * infer their dimensionality from it). The stub has no 'use gpu' directive, so later
 * transforms leave it alone.
 */
export function stubFor(node: MetadatableFunction): string {
  const firstNonSimple = node.params.findIndex(
    (p) => t.isAssignmentPattern(p) || t.isRestElement(p),
  );
  const arity = firstNonSimple === -1 ? node.params.length : firstNonSimple;
  const params = [...Array.from({ length: arity }, (_, i) => `a${i}`), '...r'].join(', ');
  const name = (!t.isArrowFunctionExpression(node) && node.id?.name) || '__tgpu_stub';
  return `function ${name}(${params}) { return (${name}.j ??= ${REVIVE}(${name}))(${params}); }`;
}

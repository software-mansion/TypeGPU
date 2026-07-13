import { WgslGenerator, type Snippet } from 'typegpu/~internal';
import type { Expression } from '../../tinyest/src/nodes';
import * as tinyest from 'tinyest';
import { tgpu } from 'typegpu';

const { NodeTypeCatalog: NODE } = tinyest;

export class CapturingGenerator extends WgslGenerator {
  // captured snippets

  protected _expression(expression: Expression): Snippet {
    if (Array.isArray(expression) && expression[0] === NODE.call) {
      const [_, calleeNode, argNodes] = expression;
      const callee = this._expression(calleeNode);
      if (callee.value === CAPTURE) {
        console.log('CAPTURING');
      }
      return super._expression(argNodes[0]);
    }
    return super._expression(expression);
  }
}

export const CAPTURE = <T>(a: T): T => a;

export function captureSnippets(fn: () => unknown) {
  const generator = new CapturingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return;
}

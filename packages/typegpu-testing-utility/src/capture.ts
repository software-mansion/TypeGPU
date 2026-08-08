import { UnknownData, WgslGenerator, type Snippet, dualImpl } from 'typegpu/~internal';
import * as tinyest from 'tinyest';
import { tgpu, type TgpuFn } from 'typegpu';

const { NodeTypeCatalog: NODE } = tinyest;

abstract class CapturingGenerator extends WgslGenerator {
  abstract readonly capturedSnippets: Snippet[];

  protected _expression(expression: tinyest.Expression): Snippet {
    if (Array.isArray(expression) && expression[0] === NODE.call) {
      const [_, calleeNode, argNodes] = expression;
      const callee = this._expression(calleeNode);
      if (callee.value === CAPTURE) {
        const snippet = this._expression(argNodes[0]);
        this.capturedSnippets.push(snippet);
        return snippet;
      }
    }
    return super._expression(expression);
  }
}

export const CAPTURE = dualImpl({
  name: 'CAPTURE',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T>(expr: T): T => expr,
  codegenImpl: (ctx, [expr]) => ctx.resolveSnippet(expr).value,
  sideEffects: false,
});

export function captureSnippets(fn: TgpuFn | (() => unknown)) {
  let capturedSnippets: Snippet[] = [];

  tgpu.resolve([fn], {
    unstable_shaderGenerator: class extends CapturingGenerator {
      get capturedSnippets() {
        return capturedSnippets;
      }
    },
  });

  return capturedSnippets;
}

export function simplifyType(snippet: Snippet) {
  return {
    ...snippet,
    dataType: snippet.dataType === UnknownData ? 'UnknownData' : snippet.dataType.type,
  };
}

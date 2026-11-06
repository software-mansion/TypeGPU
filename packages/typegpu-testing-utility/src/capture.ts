import * as tinyest from 'tinyest';
import { d, tgpu, WgslGenerator, type TgpuFn } from 'typegpu';
import { dualImpl, UnknownData, type ResolvedStatement, type Snippet } from 'typegpu/~internal';
import type { ExternalMap } from '../../typegpu/src/core/resolve/externals.ts';

const { NodeTypeCatalog: NODE } = tinyest;

export class CapturingGenerator extends WgslGenerator {
  public capturedSnippets: Snippet[] = [];

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
  const generator = new CapturingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.capturedSnippets;
}

export class FollowingGenerator extends WgslGenerator {
  public capturedStatements: ResolvedStatement[] = [];
  private traversedBlocks: Set<tinyest.Statement[]> = new Set();

  protected _block(
    [_, statementNodes]: tinyest.Block,
    allowInlining: boolean,
    externalMap?: ExternalMap,
  ): ResolvedStatement {
    if (this.traversedBlocks.has(statementNodes)) {
      return super._block([_, statementNodes], allowInlining, externalMap);
    }
    this.traversedBlocks.add(statementNodes);

    let captureNextStatement = false;
    for (const statementNode of statementNodes) {
      const statement = this._statement(statementNode);

      if (Array.isArray(statementNode) && statementNode[0] === NODE.call) {
        const [_, calleeNode] = statementNode;
        const callee = this._expression(calleeNode);
        if (callee.value === CAPTURE_FOLLOWING) {
          captureNextStatement = true;
          continue;
        }
      }

      if (captureNextStatement) {
        this.capturedStatements.push(statement);
        captureNextStatement = false;
      }
    }

    return super._block([_, statementNodes], allowInlining, externalMap);
  }
}

export const CAPTURE_FOLLOWING = dualImpl({
  name: 'CAPTURE_FOLLOWING',
  signature: () => ({ argTypes: [], returnType: d.Void }),
  normalImpl: () => undefined,
  codegenImpl: () => '',
  sideEffects: false,
});

export function captureStatements(fn: TgpuFn | (() => unknown)) {
  const generator = new FollowingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.capturedStatements;
}

export function simplifyType(snippet: Snippet) {
  return {
    ...snippet,
    dataType: snippet.dataType === UnknownData ? 'UnknownData' : snippet.dataType.type,
  };
}

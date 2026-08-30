import {
  UnknownData,
  WgslGenerator,
  type FunctionDefinitionOptions,
  type ResolvedStatement,
  type Snippet,
  dualImpl,
} from 'typegpu/~internal';
import * as tinyest from 'tinyest';
import { tgpu, type TgpuFn } from 'typegpu';
import { Void } from 'typegpu/data';

const { NodeTypeCatalog: NODE } = tinyest;

export class CapturingGenerator extends WgslGenerator {
  public capturedSnippets: Snippet[] = [];
  public capturedStatements: ResolvedStatement[] = [];
  #captureFollowingByBlock: boolean[] = [];

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

  protected _statement(statement: tinyest.Statement): ResolvedStatement {
    const currentBlock = this.#captureFollowingByBlock.length - 1;
    if (Array.isArray(statement) && statement[0] === NODE.call) {
      const [_, calleeNode, argNodes] = statement;
      const callee = this._expression(calleeNode);
      if (callee.value === CAPTURE_FOLLOWING && argNodes.length === 0) {
        if (currentBlock < 0) {
          throw new Error('CAPTURE_FOLLOWING can only be used inside a function');
        }
        if (this.#captureFollowingByBlock[currentBlock]) {
          throw new Error('CAPTURE_FOLLOWING must be followed by a statement');
        }
        this.#captureFollowingByBlock[currentBlock] = true;
        return { code: '', definesInNearestScope: false };
      }
    }

    const shouldCapture = this.#captureFollowingByBlock[currentBlock] === true;
    if (shouldCapture) {
      this.#captureFollowingByBlock[currentBlock] = false;
    }

    const resolved = super._statement(statement);
    if (shouldCapture) {
      this.capturedStatements.push(resolved);
    }
    return resolved;
  }

  protected _block(
    block: tinyest.Block,
    allowInlining: boolean,
    externalMap?: Record<string, unknown>,
  ): ResolvedStatement {
    this.#captureFollowingByBlock.push(false);
    try {
      const resolved = super._block(block, allowInlining, externalMap);
      const currentBlock = this.#captureFollowingByBlock.length - 1;
      if (this.#captureFollowingByBlock[currentBlock]) {
        throw new Error('CAPTURE_FOLLOWING must be followed by a statement');
      }
      return resolved;
    } finally {
      this.#captureFollowingByBlock.pop();
    }
  }

  public functionDefinition(options: FunctionDefinitionOptions): string {
    const firstCapturedStatement = this.capturedStatements.length;
    const definition = super.functionDefinition(options);

    for (let i = firstCapturedStatement; i < this.capturedStatements.length; i++) {
      const statement = this.capturedStatements[i];
      if (statement) {
        statement.code = this._replaceVariablePlaceholders(statement.code);
      }
    }

    return definition;
  }
}

export const CAPTURE = dualImpl({
  name: 'CAPTURE',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T>(expr: T): T => expr,
  codegenImpl: (ctx, [expr]) => ctx.resolveSnippet(expr).value,
  sideEffects: false,
});

export const CAPTURE_FOLLOWING = dualImpl<() => void>({
  name: 'CAPTURE_FOLLOWING',
  signature: { argTypes: [], returnType: Void },
  normalImpl: () => undefined,
  codegenImpl: () => '',
  sideEffects: false,
});

export function captureSnippets(fn: TgpuFn | (() => unknown)) {
  const generator = new CapturingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.capturedSnippets;
}

/** Captures the next resolved statement, including an empty statement if it folds away at comptime. */
export function captureStatements(fn: TgpuFn | (() => unknown)) {
  const generator = new CapturingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.capturedStatements;
}

export function simplifyType(snippet: Snippet) {
  return {
    ...snippet,
    dataType: snippet.dataType === UnknownData ? 'UnknownData' : snippet.dataType.type,
  };
}

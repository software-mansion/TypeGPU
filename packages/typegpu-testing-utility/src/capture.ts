import * as tinyest from 'tinyest';
import { d, tgpu, type TgpuFn } from 'typegpu';
import {
  dualImpl,
  UnknownData,
  type ResolvedStatement,
  type Snippet,
  WgslGenerator,
  type FunctionDefinitionOptions,
} from 'typegpu/~internal';

const { NodeTypeCatalog: NODE } = tinyest;

type FunctionScopeLayer = NonNullable<WgslGenerator['ctx']['topFunctionScope']>;

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
  private capturedStatements: { stmt: ResolvedStatement; scope: FunctionScopeLayer }[] = [];
  private captureNextStatement = false;

  protected _statement(statement: tinyest.Statement): ResolvedStatement {
    if (this.captureNextStatement) {
      this.captureNextStatement = false;
      const resolvedStatement = super._statement(statement);
      const scope = this.ctx.topFunctionScope;

      if (!scope) {
        throw new Error('No function scope found');
      }

      this.capturedStatements.push({ stmt: resolvedStatement, scope });
      return resolvedStatement;
    }

    return super._statement(statement);
  }

  protected _expression(expression: tinyest.Expression): Snippet {
    if (Array.isArray(expression) && expression[0] === NODE.call) {
      const callee = this._expression(expression[1]);
      if (callee.value === CAPTURE_FOLLOWING) {
        this.captureNextStatement = true;
      }
    }

    return super._expression(expression);
  }

  public functionDefinition(options: FunctionDefinitionOptions): string {
    const result = super.functionDefinition(options);

    this.capturedStatements = this.capturedStatements.map((captured) => {
      if (captured.scope !== this.ctx.topFunctionScope) {
        return captured;
      }

      return {
        ...captured,
        stmt: {
          ...captured.stmt,
          code: this.replaceVariablePlaceholders(captured.stmt.code, captured.scope),
        },
      };
    });

    return result;
  }

  public getCapturedStatements(): ResolvedStatement[] {
    return this.capturedStatements.map((captured) => captured.stmt);
  }
}

/**
 * Captures the next statement.
 * Assumes the next statement is directly after.
 */
export const CAPTURE_FOLLOWING = dualImpl({
  name: 'CAPTURE_FOLLOWING',
  signature: () => ({ argTypes: [], returnType: d.Void }),
  codegenImpl: () => '',
  normalImpl: () => undefined,
  sideEffects: false,
});

export function captureStatements(fn: TgpuFn | (() => unknown)) {
  const generator = new FollowingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.getCapturedStatements();
}

export function simplifyType(snippet: Snippet) {
  return {
    ...snippet,
    dataType: snippet.dataType === UnknownData ? 'UnknownData' : snippet.dataType.type,
  };
}

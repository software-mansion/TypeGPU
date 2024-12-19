import type * as smol from 'tinyest';
import { bool } from '../data';
import { isWgslData } from '../data/wgslTypes';
import {
  type ResolutionCtx,
  type Resource,
  UnknownData,
  type Wgsl,
  isWgsl,
} from '../types';

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  indent(): string;
  dedent(): string;
  getById(id: string): Resource;
};

function resolveRes(ctx: GenerationCtx, res: Resource): string {
  if (isWgsl(res.value) || isWgslData(res.value)) {
    return ctx.resolve(res.value);
  }

  return String(res.value);
}

function assertExhaustive(value: unknown): never {
  throw new Error(
    `'${JSON.stringify(value)}' was not handled by the WGSL generator.`,
  );
}

function generateBoolean(ctx: GenerationCtx, value: boolean): Resource {
  return value
    ? { value: 'true', dataType: bool }
    : { value: 'false', dataType: bool };
}

function generateBlock(ctx: GenerationCtx, value: smol.Block): string {
  return `${ctx.indent()}{
${value.b.map((statement) => generateStatement(ctx, statement)).join('\n')}
${ctx.dedent()}}`;
}

function generateIdentifier(ctx: GenerationCtx, id: string): Resource {
  return ctx.getById(id);
}

function generateExpression(
  ctx: GenerationCtx,
  expression: smol.Expression,
): Resource {
  if (typeof expression === 'string') {
    return generateIdentifier(ctx, expression);
  }

  if (typeof expression === 'boolean') {
    return generateBoolean(ctx, expression);
  }

  if ('x' in expression) {
    // Logical/Binary/Assignment Expression

    const [lhs, op, rhs] = expression.x;
    const lhsExpr = resolveRes(ctx, generateExpression(ctx, lhs));
    const rhsExpr = resolveRes(ctx, generateExpression(ctx, rhs));
    return {
      value: `${lhsExpr} ${op} ${rhsExpr}`,
      // TODO: Infer data type from expression type and arguments.
      dataType: UnknownData,
    };
  }

  if ('a' in expression) {
    // Member Access

    const [targetId, property] = expression.a;
    const target = generateExpression(ctx, targetId);
    const propertyStr = resolveRes(ctx, generateExpression(ctx, property));

    if (typeof target.value === 'string') {
      return {
        value: `${target.value}.${propertyStr}`,
        // TODO: Infer data type
        dataType: UnknownData,
      };
    }

    if (isWgsl(target.value)) {
      // NOTE: Temporary solution, assuming that access to `.value` of resolvables should always resolve to just the target.
      if (propertyStr === 'value') {
        return {
          value: resolveRes(ctx, target),
          // TODO: Infer data type
          dataType: UnknownData,
        };
      }

      return {
        // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
        value: (target.value as any)[propertyStr],
        // TODO: Infer data type
        dataType: UnknownData,
      };
    }

    if (typeof target.value === 'object') {
      return {
        // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
        value: (target.value as any)[propertyStr],
        // TODO: Infer data type
        dataType: UnknownData,
      };
    }

    throw new Error(`Cannot access member ${propertyStr} of ${target.value}`);
  }

  if ('i' in expression) {
    // Index Access

    const [target, property] = expression.i;
    const targetStr = resolveRes(ctx, generateExpression(ctx, target));
    const propertyStr = resolveRes(ctx, generateExpression(ctx, property));

    return {
      value: `${targetStr}[${propertyStr}]`,
      // TODO: Infer data type
      dataType: UnknownData,
    };
  }

  if ('n' in expression) {
    // Numeric Literal

    // TODO: Infer numeric data type from literal
    return { value: expression.n, dataType: UnknownData };
  }

  if ('f' in expression) {
    // Function Call

    const [callee, args] = expression.f;
    const id = generateExpression(ctx, callee);
    const idValue = id.value;

    const argResources = args.map((arg) => generateExpression(ctx, arg));
    const argValues = argResources.map((res) => resolveRes(ctx, res));

    if (typeof idValue === 'string') {
      return {
        value: `${idValue}(${argValues.join(', ')})`,
        dataType: UnknownData,
      };
    }

    // Assuming that `id` is callable
    // TODO: Pass in resources, not just values.
    const result = (idValue as unknown as (...args: unknown[]) => unknown)(
      ...argValues,
    ) as Wgsl;
    // TODO: Make function calls return resources instead of just values.
    return { value: result, dataType: UnknownData };
  }

  assertExhaustive(expression);
}

function generateStatement(
  ctx: GenerationCtx,
  statement: smol.Statement,
): string {
  if (typeof statement === 'string') {
    return `${ctx.pre}${resolveRes(ctx, generateIdentifier(ctx, statement))};`;
  }

  if (typeof statement === 'boolean') {
    return `${ctx.pre}${resolveRes(ctx, generateBoolean(ctx, statement))};`;
  }

  if ('r' in statement) {
    return statement.r === null
      ? `${ctx.pre}return;`
      : `${ctx.pre}return ${resolveRes(ctx, generateExpression(ctx, statement.r))};`;
  }

  if ('q' in statement) {
    const [cond, cons, alt] = statement.q;
    const condition = resolveRes(ctx, generateExpression(ctx, cond));

    ctx.indent(); // {
    const consequent = generateStatement(ctx, cons);
    ctx.dedent(); // }

    ctx.indent(); // {
    const alternate = alt ? generateStatement(ctx, alt) : undefined;
    ctx.dedent(); // }

    if (!alternate) {
      return `\
${ctx.pre}if (${condition})
${consequent}`;
    }

    return `\
${ctx.pre}if (${condition})
${consequent}
${ctx.pre}else
${alternate}`;
  }

  if ('l' in statement || 'c' in statement) {
    const [rawId, rawValue] = 'l' in statement ? statement.l : statement.c;
    const id = resolveRes(ctx, generateIdentifier(ctx, rawId));
    const eq = rawValue ? generateExpression(ctx, rawValue) : undefined;

    if (!eq) {
      throw new Error('Cannot create variable without an initial value.');
    }

    return `${ctx.pre}var ${id} = ${resolveRes(ctx, eq)};`;
  }

  if ('b' in statement) {
    // TODO: Push block scope layer onto the stack
    return generateBlock(ctx, statement);
  }

  return `${ctx.pre}${resolveRes(ctx, generateExpression(ctx, statement))};`;
}

export function generateFunction(ctx: GenerationCtx, body: smol.Block): string {
  return generateBlock(ctx, body);
}

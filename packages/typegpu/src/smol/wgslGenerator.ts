import { bool } from '../data';
import {
  type ResolutionCtx,
  type Resource,
  UnknownData,
  type Wgsl,
  isResolvable,
} from '../types';
import type * as smol from './nodes';

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  indent(): string;
  dedent(): string;
  getById(id: string): Resource;
  // getDataType(node: smol.AnyNode): AnyTgpuData;
};

function resolveRes(ctx: GenerationCtx, res: Resource): string {
  if (typeof res.value === 'string') {
    return res.value;
  }
  return ctx.resolve(res.value);
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
${value.block.map((statement) => generateStatement(ctx, statement)).join('\n')}
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

  if ('x2' in expression) {
    // Logical/Binary/Assignment Expression

    const [lhs, op, rhs] = expression.x2;
    const lhsExpr = resolveRes(ctx, generateExpression(ctx, lhs));
    const rhsExpr = resolveRes(ctx, generateExpression(ctx, rhs));
    return {
      value: `${lhsExpr} ${op} ${rhsExpr}`,
      // TODO: Infer data type from expression type and arguments.
      dataType: UnknownData,
    };
  }

  if ('.' in expression) {
    // Member Access

    const [targetId, property] = expression['.'];
    const target = generateExpression(ctx, targetId);
    const targetStr = resolveRes(ctx, target);
    const propertyStr = resolveRes(ctx, generateExpression(ctx, property));

    if (isResolvable(target.value)) {
      // NOTE: Temporary solution, assuming that access to `.value` of resolvables should always resolve to just the target.
      return {
        value: targetStr,
        // TODO: Infer data type
        dataType: UnknownData,
      };
    }

    return {
      value: `${targetStr}.${propertyStr}`,
      // TODO: Infer data type
      dataType: UnknownData,
    };
  }

  if ('[]' in expression) {
    // Index Access

    const [target, property] = expression['[]'];
    const targetStr = resolveRes(ctx, generateExpression(ctx, target));
    const propertyStr = resolveRes(ctx, generateExpression(ctx, property));

    return {
      value: `${targetStr}[${propertyStr}]`,
      // TODO: Infer data type
      dataType: UnknownData,
    };
  }

  if ('num' in expression) {
    // Numeric Literal

    // TODO: Infer numeric data type from literal
    return { value: expression.num, dataType: UnknownData };
  }

  if ('call' in expression) {
    // Function Call

    const id = generateExpression(ctx, expression.call);
    const idValue = id.value;

    const argResources = expression.args.map((arg) =>
      generateExpression(ctx, arg),
    );
    const argValues = argResources.map((res) => res.value);

    if (isResolvable(idValue)) {
      // Assuming that `id` is callable
      // TODO: Pass in resources, not just values.
      const result = (idValue as unknown as (...args: unknown[]) => unknown)(
        argValues,
      ) as Wgsl;
      // TODO: Make function calls return resources instead of just values.
      return { value: result, dataType: UnknownData };
    }

    return {
      value: `${String(idValue)}(${argValues.join(', ')})`,
      dataType: UnknownData,
    };
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

  if ('return' in statement) {
    return statement.return === null
      ? `${ctx.pre}return;`
      : `${ctx.pre}return ${resolveRes(ctx, generateExpression(ctx, statement.return))};`;
  }

  if ('if' in statement) {
    const condition = resolveRes(ctx, generateExpression(ctx, statement.if));

    ctx.indent(); // {
    const consequent = generateStatement(ctx, statement.do);
    ctx.dedent(); // }

    ctx.indent(); // {
    const alternate = statement.else
      ? generateStatement(ctx, statement.else)
      : undefined;
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

  if ('let' in statement) {
    const id = resolveRes(ctx, generateIdentifier(ctx, statement.let));
    const init = generateExpression(ctx, statement.be);
    // TODO: Associate this declaration with the data-type.

    return `${ctx.pre}let ${id} = ${resolveRes(ctx, init)};`;
  }

  if ('var' in statement) {
    const id = resolveRes(ctx, generateIdentifier(ctx, statement.var));
    const init = statement.init
      ? generateExpression(ctx, statement.init)
      : undefined;
    // TODO: Associate this declaration with the data-type.

    if (!init) {
      throw new Error(`Cannot create 'var' without an initial value.`);
    }

    return `${ctx.pre}var ${id} = ${resolveRes(ctx, init)};`;
  }

  if ('block' in statement) {
    return generateBlock(ctx, statement);
  }

  return `${ctx.pre}${resolveRes(ctx, generateExpression(ctx, statement))};`;
}

export function generateFunction(ctx: GenerationCtx, body: smol.Block): string {
  return generateBlock(ctx, body);
}

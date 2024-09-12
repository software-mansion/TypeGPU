import { bool } from '../data';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable } from '../types';
import type * as smol from './nodes';

export const UnknownData = Symbol('Unknown data type');
export type UnknownData = typeof UnknownData;

export type Resource = {
  value: string | TgpuResolvable;
  dataType: AnyTgpuData | UnknownData;
};

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
  throw new Error(`'${value}' was not handled by the WGSL generator.`);
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
  //
  return { value: '', dataType: UnknownData };
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
      : `${ctx.pre}return ${generateExpression(ctx, statement.return)};`;
  }

  if ('if' in statement) {
    const condition = resolveRes(ctx, generateExpression(ctx, statement.if));
    const consequent = generateStatement(ctx, statement.do);
    const alternate = statement.else
      ? generateStatement(ctx, statement.else)
      : undefined;

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

  assertExhaustive(statement);
}

export function generateFunction(ctx: GenerationCtx, body: smol.Block): string {
  return generateBlock(ctx, body);
}

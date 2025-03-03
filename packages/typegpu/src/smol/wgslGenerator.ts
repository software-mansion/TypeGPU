import type * as smol from 'tinyest';
import * as d from '../data';
import * as wgsl from '../data/wgslTypes';
import {
  type ResolutionCtx,
  type Resource,
  UnknownData,
  type Wgsl,
  isWgsl,
} from '../types';
import {
  getTypeForIndexAccess,
  getTypeForPropAccess,
  numericLiteralToResource,
} from './generationHelpers';

const parenthesizedOps = [
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '|',
  '^',
  '&',
  '&&',
  '||',
];

function operatorToType<
  TL extends wgsl.AnyWgslData | UnknownData,
  TR extends wgsl.AnyWgslData | UnknownData,
>(
  lhs: TL,
  op:
    | smol.BinaryOperator
    | smol.AssignmentOperator
    | smol.LogicalOperator
    | smol.UnaryOperator,
  rhs?: TR,
): TL | TR | wgsl.Bool {
  if (!rhs) {
    if (op === '!' || op === '~') {
      return d.bool;
    }

    return lhs;
  }

  if (
    op === '==' ||
    op === '!=' ||
    op === '<' ||
    op === '<=' ||
    op === '>' ||
    op === '>=' ||
    op === '&&' ||
    op === '||'
  ) {
    return d.bool;
  }

  if (op === '=') {
    return rhs;
  }

  return lhs;
}

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  readonly callStack: unknown[];
  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  getById(id: string): Resource | null;
  defineVariable(
    id: string,
    dataType: wgsl.AnyWgslData | UnknownData,
  ): Resource;
};

export function resolveRes(ctx: GenerationCtx, res: Resource): string {
  if (isWgsl(res.value)) {
    return ctx.resolve(res.value);
  }

  return String(res.value);
}

function assertExhaustive(value: unknown): never {
  throw new Error(
    `'${JSON.stringify(value)}' was not handled by the WGSL generator.`,
  );
}

export function generateBoolean(ctx: GenerationCtx, value: boolean): Resource {
  return value
    ? { value: 'true', dataType: d.bool }
    : { value: 'false', dataType: d.bool };
}

export function generateBlock(ctx: GenerationCtx, value: smol.Block): string {
  ctx.pushBlockScope();
  try {
    return `${ctx.indent()}{
${value.b.map((statement) => generateStatement(ctx, statement)).join('\n')}
${ctx.dedent()}}`;
  } finally {
    ctx.popBlockScope();
  }
}

export function registerBlockVariable(
  ctx: GenerationCtx,
  id: string,
  dataType: wgsl.AnyWgslData | UnknownData,
): Resource {
  return ctx.defineVariable(id, dataType);
}

export function generateIdentifier(ctx: GenerationCtx, id: string): Resource {
  const res = ctx.getById(id);
  if (!res) {
    throw new Error(`Identifier ${id} not found`);
  }

  return res;
}

export function generateExpression(
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
    const lhsExpr = generateExpression(ctx, lhs);
    const lhsStr = resolveRes(ctx, lhsExpr);
    const rhsExpr = generateExpression(ctx, rhs);
    const rhsStr = resolveRes(ctx, rhsExpr);

    const type = operatorToType(lhsExpr.dataType, op, rhsExpr.dataType);

    return {
      value: parenthesizedOps.includes(op)
        ? `(${lhsStr} ${op} ${rhsStr})`
        : `${lhsStr} ${op} ${rhsStr}`,
      dataType: type,
    };
  }

  if ('u' in expression) {
    // Unary Expression

    const [op, arg] = expression.u;
    const argExpr = generateExpression(ctx, arg);
    const argStr = resolveRes(ctx, argExpr);

    const type = operatorToType(argExpr.dataType, op);
    return {
      value: `${op}${argStr}`,
      dataType: type,
    };
  }

  if ('a' in expression) {
    // Member Access
    console.log('accessing member', expression.a);

    const [targetId, property] = expression.a;
    const target = generateExpression(ctx, targetId);
    const propertyStr = property;

    console.log('target:', target);
    console.log('property:', propertyStr);
    console.log(
      'typeforpropaccess:',
      getTypeForPropAccess(target.dataType as Wgsl, propertyStr),
    );

    if (typeof target.value === 'string') {
      return {
        value: `${target.value}.${propertyStr}`,
        dataType:
          getTypeForPropAccess(target.dataType as Wgsl, propertyStr) ??
          UnknownData,
      };
    }

    if (isWgsl(target.value)) {
      return {
        // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
        value: (target.value as any)[propertyStr],
        // TODO: Infer data type
        dataType:
          getTypeForPropAccess(target.value as d.AnyWgslData, propertyStr) ??
          UnknownData,
      };
    }

    if (typeof target.value === 'object') {
      return {
        // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
        value: (target.value as any)[propertyStr],
        // TODO: Infer data type (but how? what if this is a function call? The return type is not very useful as it's a lie)
        dataType: UnknownData,
      };
    }

    throw new Error(`Cannot access member ${propertyStr} of ${target.value}`);
  }

  if ('i' in expression) {
    // Index Access

    const [target, property] = expression.i;
    const targetExpr = generateExpression(ctx, target);
    const targetStr = resolveRes(ctx, targetExpr);
    const propertyExpr = generateExpression(ctx, property);
    const propertyStr = resolveRes(ctx, propertyExpr);

    return {
      value: `${targetStr}[${propertyStr}]`,
      dataType:
        getTypeForIndexAccess(targetExpr.dataType as d.AnyWgslData) ??
        UnknownData,
    };
  }

  if ('n' in expression) {
    // Numeric Literal
    const value = expression.n;

    const type = numericLiteralToResource(value);
    if (type) {
      return type;
    }

    throw new Error(`Invalid numeric literal ${value}`);
  }

  if ('f' in expression) {
    // Function Call

    const [callee, args] = expression.f;
    const id = generateExpression(ctx, callee);
    const idValue = id.value;

    ctx.callStack.push(idValue);

    const argResources = args.map((arg) => generateExpression(ctx, arg));
    const resolvedResources = argResources.map((res) => ({
      value: resolveRes(ctx, res),
      dataType: res.dataType,
    }));
    const argValues = resolvedResources.map((res) => res.value);

    ctx.callStack.pop();

    if (typeof idValue === 'string') {
      return {
        value: `${idValue}(${argValues.join(', ')})`,
        dataType: id.dataType,
      };
    }

    if (wgsl.isWgslStruct(idValue)) {
      const resolvedId = ctx.resolve(idValue);

      return {
        value: `${resolvedId}(${argValues.join(', ')})`,
        dataType: id.dataType,
      };
    }

    // Assuming that `id` is callable
    // TODO: Pass in resources, not just values.
    const result = (idValue as unknown as (...args: unknown[]) => unknown)(
      ...resolvedResources,
    ) as Resource;
    // TODO: Make function calls return resources instead of just values.
    return result;
  }

  if ('o' in expression) {
    const obj = expression.o;
    const callee = ctx.callStack[ctx.callStack.length - 1];

    const generateEntries = (values: smol.Expression[]) =>
      values
        .map((value) => {
          const valueRes = generateExpression(ctx, value);
          return resolveRes(ctx, valueRes);
        })
        .join(', ');

    if (wgsl.isWgslStruct(callee)) {
      const propKeys = Object.keys(callee.propTypes);
      const values = propKeys.map((key) => {
        const val = obj[key];
        if (val === undefined) {
          throw new Error(
            `Missing property ${key} in object literal for struct ${callee}`,
          );
        }
        return val;
      });

      return {
        value: generateEntries(values),
        dataType: callee,
      };
    }

    return {
      value: generateEntries(Object.values(obj)),
      dataType: UnknownData,
    };
  }

  assertExhaustive(expression);
}

export function generateStatement(
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
    // check if the thing at the top of the call stack is a struct and the statement is a plain JS object
    // if so wrap the value returned in a constructor of the struct (its resolved name)
    if (
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1]) &&
      statement.r !== null &&
      typeof statement.r === 'object' &&
      'o' in statement.r
    ) {
      const resource = resolveRes(ctx, generateExpression(ctx, statement.r));
      const resolvedStruct = ctx.resolve(
        ctx.callStack[ctx.callStack.length - 1],
      );
      return `${ctx.pre}return ${resolvedStruct}(${resource});`;
    }

    return statement.r === null
      ? `${ctx.pre}return;`
      : `${ctx.pre}return ${resolveRes(
          ctx,
          generateExpression(ctx, statement.r),
        )};`;
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
    const eq = rawValue ? generateExpression(ctx, rawValue) : undefined;

    if (!eq || !rawValue) {
      throw new Error('Cannot create variable without an initial value.');
    }

    registerBlockVariable(ctx, rawId, eq.dataType);
    const id = resolveRes(ctx, generateIdentifier(ctx, rawId));

    // If the value is a plain JS object it has to be an output struct
    if (
      typeof rawValue === 'object' &&
      'o' in rawValue &&
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1])
    ) {
      const resolvedStruct = ctx.resolve(
        ctx.callStack[ctx.callStack.length - 1],
      );
      return `${ctx.pre}var ${id} = ${resolvedStruct}(${resolveRes(ctx, eq)});`;
    }

    return `${ctx.pre}var ${id} = ${resolveRes(ctx, eq)};`;
  }

  if ('b' in statement) {
    ctx.pushBlockScope();
    try {
      return generateBlock(ctx, statement);
    } finally {
      ctx.popBlockScope();
    }
  }

  return `${ctx.pre}${resolveRes(ctx, generateExpression(ctx, statement))};`;
}

export function generateFunction(ctx: GenerationCtx, body: smol.Block): string {
  return generateBlock(ctx, body);
}

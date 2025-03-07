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
  getTypeFromWgsl,
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

const binaryLogicalOps = ['&&', '||', '==', '!=', '<', '<=', '>', '>='];

type Oprator =
  | smol.BinaryOperator
  | smol.AssignmentOperator
  | smol.LogicalOperator
  | smol.UnaryOperator;

function operatorToType<
  TL extends wgsl.AnyWgslData | UnknownData,
  TR extends wgsl.AnyWgslData | UnknownData,
>(lhs: TL, op: Oprator, rhs?: TR): TL | TR | wgsl.Bool {
  if (!rhs) {
    if (op === '!' || op === '~') {
      return d.bool;
    }

    return lhs;
  }

  if (binaryLogicalOps.includes(op)) {
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

function assertExhaustive(value: never): never {
  throw new Error(
    `'${JSON.stringify(value)}' was not handled by the WGSL generator.`,
  );
}

export function generateBoolean(ctx: GenerationCtx, value: boolean): Resource {
  return { value: value ? 'true' : 'false', dataType: d.bool };
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
    const rhsExpr = generateExpression(ctx, rhs);

    const lhsStr = resolveRes(ctx, lhsExpr);
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
    const [targetId, property] = expression.a;
    const target = generateExpression(ctx, targetId);

    if (typeof target.value === 'string') {
      return {
        value: `${target.value}.${property}`,
        dataType:
          getTypeForPropAccess(target.dataType as Wgsl, property) ??
          UnknownData,
      };
    }
    // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
    const value = (target.value as any)[property];

    if (isWgsl(target.value)) {
      return {
        value,
        dataType:
          getTypeForPropAccess(target.value as d.AnyWgslData, property) ??
          UnknownData,
      };
    }

    if (typeof target.value === 'object') {
      const dataType = isWgsl(value) ? getTypeFromWgsl(value) : UnknownData;

      return {
        value,
        dataType,
      };
    }

    throw new Error(`Cannot access member ${property} of ${target.value}`);
  }

  if ('i' in expression) {
    // Index Access
    const [target, property] = expression.i;
    const targetExpr = generateExpression(ctx, target);
    const propertyExpr = generateExpression(ctx, property);
    const targetStr = resolveRes(ctx, targetExpr);
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
    const type = numericLiteralToResource(expression.n);
    if (!type) {
      throw new Error(`Invalid numeric literal ${expression.n}`);
    }
    return type;
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
    return (idValue as unknown as (...args: unknown[]) => unknown)(
      ...resolvedResources,
    ) as Resource;
  }

  if ('o' in expression) {
    // Object Literal
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

  if ('s' in expression) {
    throw new Error('Cannot use string literals in TGSL.');
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

  // 'j' stands for for (trust me)
  if ('j' in statement) {
    const [init, condition, update, body] = statement.j;

    const initStatement = init ? generateStatement(ctx, init) : undefined;
    const initStr = initStatement ? initStatement.slice(0, -1) : '';

    const conditionExpr = condition
      ? generateExpression(ctx, condition)
      : undefined;
    const conditionStr = conditionExpr ? resolveRes(ctx, conditionExpr) : '';

    const updateStatement = update ? generateStatement(ctx, update) : undefined;
    const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

    ctx.indent();
    const bodyStr = generateStatement(ctx, body);
    ctx.dedent();

    return `\
${ctx.pre}for (${initStr}; ${conditionStr}; ${updateStr})
${bodyStr}`;
  }

  if ('w' in statement) {
    const [condition, body] = statement.w;
    const conditionStr = resolveRes(ctx, generateExpression(ctx, condition));

    ctx.indent();
    const bodyStr = generateStatement(ctx, body);
    ctx.dedent();

    return `\
${ctx.pre}while (${conditionStr})
${bodyStr}`;
  }

  if ('k' in statement) {
    return `${ctx.pre}continue;`;
  }

  if ('d' in statement) {
    return `${ctx.pre}break;`;
  }

  return `${ctx.pre}${resolveRes(ctx, generateExpression(ctx, statement))};`;
}

export function generateFunction(ctx: GenerationCtx, body: smol.Block): string {
  return generateBlock(ctx, body);
}

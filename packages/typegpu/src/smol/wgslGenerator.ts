import type * as smol from 'tinyest';
import { arrayOf } from '../data/array.ts';
import { type AnyData, isData, isLooseData } from '../data/dataTypes.ts';
import { abstractInt, bool, f32, i32, u32 } from '../data/numeric.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { $internal } from '../shared/symbols.ts';
import {
  type Snippet,
  UnknownData,
  isMarkedInternal,
  isWgsl,
} from '../types.ts';
import {
  type GenerationCtx,
  convertStructValues,
  convertToCommonType,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  getTypeFromWgsl,
  numericLiteralToSnippet,
  resolveRes,
} from './generationHelpers.ts';

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

type Operator =
  | smol.BinaryOperator
  | smol.AssignmentOperator
  | smol.LogicalOperator
  | smol.UnaryOperator;

function operatorToType<
  TL extends AnyData | UnknownData,
  TR extends AnyData | UnknownData,
>(lhs: TL, op: Operator, rhs?: TR): TL | TR | wgsl.Bool {
  if (!rhs) {
    if (op === '!' || op === '~') {
      return bool;
    }

    return lhs;
  }

  if (binaryLogicalOps.includes(op)) {
    return bool;
  }

  if (op === '=') {
    return rhs;
  }

  return lhs;
}

function assertExhaustive(value: never): never {
  throw new Error(
    `'${JSON.stringify(value)}' was not handled by the WGSL generator.`,
  );
}

export function generateBoolean(ctx: GenerationCtx, value: boolean): Snippet {
  return { value: value ? 'true' : 'false', dataType: bool };
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
): Snippet {
  return ctx.defineVariable(id, dataType);
}

export function generateIdentifier(ctx: GenerationCtx, id: string): Snippet {
  const res = ctx.getById(id);
  if (!res) {
    throw new Error(`Identifier ${id} not found`);
  }

  return res;
}

export function generateExpression(
  ctx: GenerationCtx,
  expression: smol.Expression,
): Snippet {
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

  if ('p' in expression) {
    // Update Expression
    const [op, arg] = expression.p;
    const argExpr = generateExpression(ctx, arg);
    const argStr = resolveRes(ctx, argExpr);

    return {
      value: `${argStr}${op}`,
      dataType: argExpr.dataType,
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

    if (wgsl.isPtr(target.dataType)) {
      return {
        value: `(*${target.value}).${property}`,
        dataType: isData(target.dataType.inner)
          ? getTypeForPropAccess(target.dataType.inner, property)
          : UnknownData,
      };
    }

    if (typeof target.value === 'string') {
      return {
        value: `${target.value}.${property}`,
        dataType: isData(target.dataType)
          ? getTypeForPropAccess(target.dataType, property)
          : UnknownData,
      };
    }

    if (wgsl.isWgslArray(target.dataType)) {
      if (property === 'length') {
        if (target.dataType.elementCount === 0) {
          // Dynamically-sized array
          return {
            value: `arrayLength(&${ctx.resolve(target.value)})`,
            dataType: u32,
          };
        }

        return {
          value: String(target.dataType.elementCount),
          dataType: abstractInt,
        };
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: <sorry TypeScript>
    const propValue = (target.value as any)[property];

    if (target.dataType.type !== 'unknown') {
      if (wgsl.isMat(target.dataType) && property === 'columns') {
        return {
          value: target.value,
          dataType: target.dataType,
        };
      }

      return {
        value: propValue,
        dataType: getTypeForPropAccess(target.dataType, property),
      };
    }

    if (isWgsl(target.value)) {
      return {
        value: propValue,
        dataType: getTypeForPropAccess(target.value, property),
      };
    }
    if (typeof target.value === 'object') {
      const dataType = isWgsl(propValue)
        ? getTypeFromWgsl(propValue)
        : UnknownData;

      return {
        value: propValue,
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

    if (wgsl.isPtr(targetExpr.dataType)) {
      return {
        value: `(*${targetStr})[${propertyStr}]`,
        dataType: isData(targetExpr.dataType.inner)
          ? getTypeForIndexAccess(targetExpr.dataType.inner)
          : UnknownData,
      };
    }

    return {
      value: `${targetStr}[${propertyStr}]`,
      dataType: isData(targetExpr.dataType)
        ? getTypeForIndexAccess(targetExpr.dataType)
        : UnknownData,
    };
  }

  if ('n' in expression) {
    // Numeric Literal
    const type = numericLiteralToSnippet(expression.n);
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

    const argSnippets = args.map((arg) => generateExpression(ctx, arg));
    const resolvedSnippets = argSnippets.map((res) => ({
      value: resolveRes(ctx, res),
      dataType: res.dataType,
    }));
    const argValues = resolvedSnippets.map((res) => res.value);

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

    if (!isMarkedInternal(idValue)) {
      throw new Error(
        `Function ${String(idValue)} has not been created using TypeGPU APIs. Did you mean to wrap the function with tgpu.fn(args, return)(...) ?`,
      );
    }

    const argTypes = idValue[$internal]?.argTypes;

    let typePairs: [wgsl.AnyWgslData, Snippet][] = [];
    if (Array.isArray(argTypes)) {
      typePairs = argTypes
        .filter((_, index) => index < resolvedSnippets.length)
        .map((type, index) => [type, resolvedSnippets[index]]) as [
        wgsl.AnyWgslData,
        Snippet,
      ][];
    } else if (typeof argTypes === 'function') {
      const types = argTypes(...resolvedSnippets) as wgsl.AnyWgslData[];
      typePairs = types
        .filter((_, index) => index < resolvedSnippets.length)
        .map((type, index) => [type, resolvedSnippets[index]]) as [
        wgsl.AnyWgslData,
        Snippet,
      ][];
    } else if (typeof argTypes === 'object' && argTypes !== null) {
      typePairs = Object.entries(argTypes).map(([key, type]) => {
        const res = (
          argSnippets[0]?.value as unknown as Record<string, Snippet>
        )[key];
        if (!res) {
          throw new Error(`Missing argument ${key} in function call`);
        }
        return [type, res] as [wgsl.AnyWgslData, Snippet];
      });
    }

    const convertedResources = argTypes
      ? typePairs.map(([type, res]) => {
          const conversion = convertToCommonType(ctx, [res], [type]);
          if (!conversion) {
            throw new Error(
              `Cannot convert ${ctx.resolve(res.dataType)} to ${ctx.resolve(
                type,
              )}`,
            );
          }
          return conversion[0];
        })
      : resolvedSnippets;

    // Assuming that `id` is callable
    const fnRes = (idValue as unknown as (...args: unknown[]) => unknown)(
      ...convertedResources,
    ) as Snippet;

    return {
      value: resolveRes(ctx, fnRes),
      dataType: fnRes.dataType,
    };
  }

  if ('o' in expression) {
    // Object Literal
    const obj = expression.o;
    const callee = ctx.callStack[ctx.callStack.length - 1];

    if (wgsl.isWgslStruct(callee)) {
      const propKeys = Object.keys(callee.propTypes);
      const entries = Object.fromEntries(
        propKeys.map((key) => {
          const val = obj[key];
          if (val === undefined) {
            throw new Error(
              `Missing property ${key} in object literal for struct ${callee}`,
            );
          }
          return [key, generateExpression(ctx, val)];
        }),
      );

      const convertedValues = convertStructValues(ctx, callee, entries);

      return {
        value: convertedValues.map((v) => resolveRes(ctx, v)).join(', '),
        dataType: callee,
      };
    }

    if (isMarkedInternal(callee)) {
      const argTypes = callee[$internal]?.argTypes;

      if (typeof argTypes === 'object' && argTypes !== null) {
        const propKeys = Object.keys(argTypes);
        const snippets: Record<string, Snippet> = {};

        for (const key of propKeys) {
          const val = obj[key];
          if (val === undefined) {
            throw new Error(
              `Missing property ${key} in object literal for function ${callee}`,
            );
          }
          const expr = generateExpression(ctx, val);
          const targetType = argTypes[key as keyof typeof argTypes];
          const converted = convertToCommonType(ctx, [expr], [targetType]);
          snippets[key] = converted?.[0] ?? expr;
        }

        return {
          value: snippets,
          dataType: UnknownData,
        };
      }
    }

    return {
      value: Object.values(obj)
        .map((value) => {
          const valueRes = generateExpression(ctx, value);
          return resolveRes(ctx, valueRes);
        })
        .join(', '),
      dataType: UnknownData,
    };
  }

  if ('y' in expression) {
    // Array Expression
    const values = expression.y.map((value) => {
      return generateExpression(ctx, value);
    });
    if (values.length === 0) {
      throw new Error('Cannot create empty array literal.');
    }

    const convertedValues = convertToCommonType(ctx, values);
    if (!convertedValues) {
      throw new Error(
        'The given values cannot be automatically converted to a common type. Consider explicitly casting them.',
      );
    }

    const targetType = convertedValues[0]?.dataType as AnyData;
    const type =
      targetType.type === 'abstractFloat'
        ? f32
        : targetType.type === 'abstractInt'
          ? i32
          : targetType;

    const typeId = ctx.resolve(type);

    const arrayType = `array<${typeId}, ${values.length}>`;
    const arrayValues = convertedValues.map((value) => resolveRes(ctx, value));

    return {
      value: `${arrayType}( ${arrayValues.join(', ')} )`,
      dataType: arrayOf(
        type as wgsl.AnyWgslData,
        values.length,
      ) as wgsl.AnyWgslData,
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
    // Special case: If returning a struct constructed via an object literal, convert fields
    if (
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1]) &&
      statement.r !== null &&
      typeof statement.r === 'object' &&
      'o' in statement.r
    ) {
      const callee = ctx.callStack[ctx.callStack.length - 1];
      const structType = callee as wgsl.WgslStruct;
      const obj = statement.r.o;

      const entries: Record<string, Snippet> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!value) {
          throw new Error(`Missing property ${key} in object literal`);
        }
        entries[key] = generateExpression(ctx, value);
      }

      const convertedValues = convertStructValues(ctx, structType, entries);
      const resolvedStruct = ctx.resolve(structType);
      return `${ctx.pre}return ${resolvedStruct}(${convertedValues.map((v) => resolveRes(ctx, v)).join(', ')});`;
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
    const condExpr = generateExpression(ctx, cond);
    let condSnippet = condExpr;

    const converted = convertToCommonType(ctx, [condExpr], [bool]);
    if (converted?.[0]) {
      [condSnippet] = converted;
    }

    const condition = resolveRes(ctx, condSnippet);

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

    if (isLooseData(eq.dataType)) {
      throw new Error('Cannot create variable with loose data type.');
    }

    registerBlockVariable(ctx, rawId, eq.dataType);
    const id = resolveRes(ctx, generateIdentifier(ctx, rawId));

    // If the value is a plain JS object it has to be an output struct
    if (
      typeof rawValue === 'object' &&
      'o' in rawValue &&
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1])
    ) {
      const structType = ctx.callStack[
        ctx.callStack.length - 1
      ] as wgsl.WgslStruct;
      const obj = rawValue.o;

      const entries: Record<string, Snippet> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!value) {
          throw new Error(`Missing property ${key} in object literal`);
        }
        entries[key] = generateExpression(ctx, value);
      }

      const convertedValues = convertStructValues(ctx, structType, entries);
      const resolvedStruct = ctx.resolve(structType);
      return `${ctx.pre}var ${id} = ${resolvedStruct}(${convertedValues.map((v) => resolveRes(ctx, v)).join(', ')});`;
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
    let condSnippet = conditionExpr;
    if (conditionExpr) {
      const converted = convertToCommonType(ctx, [conditionExpr], [bool]);
      if (converted?.[0]) {
        [condSnippet] = converted;
      }
    }
    const conditionStr = condSnippet ? resolveRes(ctx, condSnippet) : '';

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
    const condExpr = generateExpression(ctx, condition);
    let condSnippet = condExpr;
    if (condExpr) {
      const converted = convertToCommonType(ctx, [condExpr], [bool]);
      if (converted?.[0]) {
        [condSnippet] = converted;
      }
    }
    const conditionStr = resolveRes(ctx, condSnippet);

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

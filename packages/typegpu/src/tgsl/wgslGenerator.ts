import * as tinyest from 'tinyest';
import { arrayOf } from '../data/array.ts';
import { type AnyData, isData, isLooseData } from '../data/dataTypes.ts';
import * as d from '../data/index.ts';
import { abstractInt } from '../data/numeric.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { $internal } from '../shared/symbols.ts';
import {
  type FnArgsConversionHint,
  isMarkedInternal,
  isWgsl,
  type Snippet,
  UnknownData,
} from '../types.ts';
import {
  concretize,
  convertStructValues,
  convertToCommonType,
  type GenerationCtx,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  getTypeFromWgsl,
  numericLiteralToSnippet,
  resolveRes,
} from './generationHelpers.ts';

const { NodeTypeCatalog: NODE } = tinyest;

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
  | tinyest.BinaryOperator
  | tinyest.AssignmentOperator
  | tinyest.LogicalOperator
  | tinyest.UnaryOperator;

function operatorToType<
  TL extends AnyData | UnknownData,
  TR extends AnyData | UnknownData,
>(lhs: TL, op: Operator, rhs?: TR): TL | TR | wgsl.Bool {
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

function assertExhaustive(value: never): never {
  throw new Error(
    `'${JSON.stringify(value)}' was not handled by the WGSL generator.`,
  );
}

export function generateBoolean(ctx: GenerationCtx, value: boolean): Snippet {
  return { value: value ? 'true' : 'false', dataType: d.bool };
}

export function generateBlock(
  ctx: GenerationCtx,
  [_, statements]: tinyest.Block,
): string {
  ctx.pushBlockScope();
  try {
    return `${ctx.indent()}{
${statements.map((statement) => generateStatement(ctx, statement)).join('\n')}
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
  expression: tinyest.Expression,
): Snippet {
  if (typeof expression === 'string') {
    return generateIdentifier(ctx, expression);
  }

  if (typeof expression === 'boolean') {
    return generateBoolean(ctx, expression);
  }

  if (
    expression[0] === NODE.logicalExpr ||
    expression[0] === NODE.binaryExpr ||
    expression[0] === NODE.assignmentExpr
  ) {
    // Logical/Binary/Assignment Expression
    const [_, lhs, op, rhs] = expression;
    const lhsExpr = generateExpression(ctx, lhs);
    const rhsExpr = generateExpression(ctx, rhs);

    const converted = convertToCommonType(ctx, [lhsExpr, rhsExpr]) as
      | [Snippet, Snippet]
      | undefined;
    const [convLhs, convRhs] = converted || [lhsExpr, rhsExpr];

    const lhsStr = resolveRes(ctx, convLhs);
    const rhsStr = resolveRes(ctx, convRhs);
    const type = operatorToType(convLhs.dataType, op, convRhs.dataType);

    return {
      value: parenthesizedOps.includes(op)
        ? `(${lhsStr} ${op} ${rhsStr})`
        : `${lhsStr} ${op} ${rhsStr}`,
      dataType: type,
    };
  }

  if (expression[0] === NODE.postUpdate) {
    // Post-Update Expression
    const [_, op, arg] = expression;
    const argExpr = generateExpression(ctx, arg);
    const argStr = resolveRes(ctx, argExpr);

    return {
      value: `${argStr}${op}`,
      dataType: argExpr.dataType,
    };
  }

  if (expression[0] === NODE.unaryExpr) {
    // Unary Expression
    const [_, op, arg] = expression;
    const argExpr = generateExpression(ctx, arg);
    const argStr = resolveRes(ctx, argExpr);

    const type = operatorToType(argExpr.dataType, op);
    return {
      value: `${op}${argStr}`,
      dataType: type,
    };
  }

  if (expression[0] === NODE.memberAccess) {
    // Member Access
    const [_, targetId, property] = expression;
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
            dataType: d.u32,
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

  if (expression[0] === NODE.indexAccess) {
    // Index Access
    const [_, target, property] = expression;
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

  if (expression[0] === NODE.numericLiteral) {
    // Numeric Literal
    const type = numericLiteralToSnippet(expression[1]);
    if (!type) {
      throw new Error(`Invalid numeric literal ${expression[1]}`);
    }
    return type;
  }

  if (expression[0] === NODE.call) {
    // Function Call
    const [_, callee, args] = expression;
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
        `Function ${
          String(idValue)
        } has not been created using TypeGPU APIs. Did you mean to wrap the function with tgpu.fn(args, return)(...) ?`,
      );
    }

    const argTypes = idValue[$internal]?.argTypes as
      | FnArgsConversionHint
      | undefined;
    let convertedResources: Snippet[];

    if (!argTypes || argTypes === 'keep') {
      convertedResources = resolvedSnippets;
    } else if (argTypes === 'coerce') {
      convertedResources = convertToCommonType(ctx, resolvedSnippets) ??
        resolvedSnippets;
    } else {
      const pairs: [wgsl.AnyWgslData, Snippet][] = Array.isArray(argTypes)
        ? (argTypes
          .map((type, i) => [type, resolvedSnippets[i]])
          .filter(([, sn]) => !!sn) as [wgsl.AnyWgslData, Snippet][])
        : typeof argTypes === 'function'
        ? ((argTypes(...resolvedSnippets) as wgsl.AnyWgslData[])
          .map((type, i) => [type, resolvedSnippets[i]])
          .filter(([, sn]) => !!sn) as [wgsl.AnyWgslData, Snippet][])
        : Object.entries(argTypes).map(([key, type]) => {
          const sn = (argSnippets[0]?.value as Record<string, Snippet>)[
            key
          ];
          if (!sn) {
            throw new Error(`Missing argument ${key} in function call`);
          }
          return [type, sn] as [wgsl.AnyWgslData, Snippet];
        });

      convertedResources = pairs.map(([type, sn]) => {
        const conv = convertToCommonType(ctx, [sn], [type])?.[0];
        if (!conv) {
          throw new Error(
            `Cannot convert ${ctx.resolve(sn.dataType)} to ${
              ctx.resolve(type)
            }`,
          );
        }
        return conv;
      });
    }

    // Assuming that `id` is callable
    const fnRes = (idValue as unknown as (...args: unknown[]) => unknown)(
      ...convertedResources,
    ) as Snippet;

    return {
      value: resolveRes(ctx, fnRes),
      dataType: fnRes.dataType,
    };
  }

  if (expression[0] === NODE.objectExpr) {
    // Object Literal
    const obj = expression[1];
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

  if (expression[0] === NODE.arrayExpr) {
    const [_, valuesRaw] = expression;
    // Array Expression
    const values = valuesRaw.map((value) =>
      generateExpression(ctx, value as tinyest.Expression)
    );
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
    const type = targetType.type === 'abstractFloat'
      ? d.f32
      : targetType.type === 'abstractInt'
      ? d.i32
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

  if (expression[0] === NODE.stringLiteral) {
    throw new Error('Cannot use string literals in TGSL.');
  }

  if (expression[0] === NODE.preUpdate) {
    throw new Error('Cannot use pre-updates in TGSL.');
  }

  assertExhaustive(expression);
}

export function generateStatement(
  ctx: GenerationCtx,
  statement: tinyest.Statement,
): string {
  if (typeof statement === 'string') {
    return `${ctx.pre}${resolveRes(ctx, generateIdentifier(ctx, statement))};`;
  }

  if (typeof statement === 'boolean') {
    return `${ctx.pre}${resolveRes(ctx, generateBoolean(ctx, statement))};`;
  }

  if (statement[0] === NODE.return) {
    const returnNode = statement[1];
    const returnValue = returnNode !== undefined
      ? resolveRes(ctx, generateExpression(ctx, returnNode))
      : undefined;

    // check if the thing at the top of the call stack is a struct and the statement is a plain JS object
    // if so wrap the value returned in a constructor of the struct (its resolved name)
    if (
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1]) &&
      typeof returnNode === 'object' &&
      returnNode[0] === NODE.objectExpr
    ) {
      const resolvedStruct = ctx.resolve(
        ctx.callStack[ctx.callStack.length - 1],
      );
      return `${ctx.pre}return ${resolvedStruct}(${returnValue});`;
    }

    return returnValue
      ? `${ctx.pre}return ${returnValue};`
      : `${ctx.pre}return;`;
  }

  if (statement[0] === NODE.if) {
    const [_, cond, cons, alt] = statement;
    const condExpr = generateExpression(ctx, cond);
    let condSnippet = condExpr;
    const converted = convertToCommonType(ctx, [condExpr], [d.bool]);
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

  if (statement[0] === NODE.let || statement[0] === NODE.const) {
    const [_, rawId, rawValue] = statement;
    const eq = rawValue ? generateExpression(ctx, rawValue) : undefined;

    if (!eq || !rawValue) {
      throw new Error('Cannot create variable without an initial value.');
    }

    if (isLooseData(eq.dataType)) {
      throw new Error('Cannot create variable with loose data type.');
    }

    registerBlockVariable(
      ctx,
      rawId,
      concretize(eq.dataType as wgsl.AnyWgslData),
    );
    const id = resolveRes(ctx, generateIdentifier(ctx, rawId));

    // If the value is a plain JS object it has to be an output struct
    if (
      typeof rawValue === 'object' &&
      rawValue[0] === NODE.objectExpr &&
      wgsl.isWgslStruct(ctx.callStack[ctx.callStack.length - 1])
    ) {
      const structType = ctx.callStack[
        ctx.callStack.length - 1
      ] as wgsl.WgslStruct;
      const obj = rawValue[1];

      const entries: Record<string, Snippet> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!value) {
          throw new Error(`Missing property ${key} in object literal`);
        }
        entries[key] = generateExpression(ctx, value);
      }

      const convertedValues = convertStructValues(ctx, structType, entries);
      const resolvedStruct = ctx.resolve(structType);
      return `${ctx.pre}var ${id} = ${resolvedStruct}(${
        convertedValues.map((v) => resolveRes(ctx, v)).join(', ')
      });`;
    }

    return `${ctx.pre}var ${id} = ${resolveRes(ctx, eq)};`;
  }

  if (statement[0] === NODE.block) {
    return generateBlock(ctx, statement);
  }

  if (statement[0] === NODE.for) {
    const [_, init, condition, update, body] = statement;

    const initStatement = init ? generateStatement(ctx, init) : undefined;
    const initStr = initStatement ? initStatement.slice(0, -1) : '';

    const conditionExpr = condition
      ? generateExpression(ctx, condition)
      : undefined;
    let condSnippet = conditionExpr;
    if (conditionExpr) {
      const converted = convertToCommonType(ctx, [conditionExpr], [d.bool]);
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

  if (statement[0] === NODE.while) {
    const [_, condition, body] = statement;
    const condExpr = generateExpression(ctx, condition);
    let condSnippet = condExpr;
    if (condExpr) {
      const converted = convertToCommonType(ctx, [condExpr], [d.bool]);
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

  if (statement[0] === NODE.continue) {
    return `${ctx.pre}continue;`;
  }

  if (statement[0] === NODE.break) {
    return `${ctx.pre}break;`;
  }

  return `${ctx.pre}${resolveRes(ctx, generateExpression(ctx, statement))};`;
}

export function generateFunction(
  ctx: GenerationCtx,
  body: tinyest.Block,
): string {
  return generateBlock(ctx, body);
}

import type * as smol from 'tinyest';
import { arrayOf } from '../data/array.ts';
import { type AnyData, isData, isLooseData } from '../data/dataTypes.ts';
import { abstractInt, bool, f32, i32, u32 } from '../data/numeric.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { invariant } from '../errors.ts';
import { $internal } from '../shared/symbols.ts';
import {
  type ResolutionCtx,
  type Snippet,
  UnknownData,
  isMarkedInternal,
  isWgsl,
} from '../types.ts';
import {
  type ConversionResult,
  type ConversionResultAction,
  convertType,
  getBestConversion,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  getTypeFromWgsl,
  numericLiteralToSnippet,
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

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  readonly callStack: unknown[];
  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  getById(id: string): Snippet | null;
  defineVariable(id: string, dataType: wgsl.AnyWgslData | UnknownData): Snippet;
};

export function resolveRes(ctx: GenerationCtx, res: Snippet): string {
  if (isWgsl(res.value)) {
    return ctx.resolve(res.value);
  }

  return String(res.value);
}

function applyActionToSnippet(
  ctx: GenerationCtx,
  value: Snippet,
  action: ConversionResultAction,
  targetType: AnyData,
): Snippet {
  if (action.action === 'none') {
    return value;
  }

  const resolvedValue = resolveRes(ctx, value);

  switch (action.action) {
    case 'ref':
      return { value: `&${resolvedValue}`, dataType: targetType };
    case 'deref':
      return { value: `*${resolvedValue}`, dataType: targetType };
    case 'cast': {
      return {
        value: `${ctx.resolve(targetType)}(${resolvedValue})`,
        dataType: targetType,
      };
    }
    default: {
      assertExhaustive(action.action);
    }
  }
}

export function convertToCommonType(
  ctx: GenerationCtx,
  values: Snippet[],
): Snippet[] | undefined {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type === UnknownData)) {
    return undefined;
  }

  const conversion = getBestConversion(types as AnyData[]);
  if (!conversion) {
    return undefined;
  }

  if (conversion.hasImplicitConversions) {
    console.warn(
      `Implicit conversions from [${types.map((t) => ctx.resolve(t)).join(', ')}] to ${ctx.resolve(conversion.targetType)} are supported, but they are not recommended. Consider using explicit conversions.`,
    );
  }

  return values.map((value, index) => {
    const action = conversion.actions[index];
    invariant(action, 'Action should not be undefined');
    return applyActionToSnippet(ctx, value, action, conversion.targetType);
  });
}

export function applyConversion(
  ctx: GenerationCtx,
  value: Snippet,
  conversion: ConversionResult,
): Snippet {
  const action = conversion.actions[0];

  invariant(action, 'Action should not be undefined');

  if (conversion.hasImplicitConversions) {
    console.warn(
      `Implicit conversion from ${ctx.resolve(value.dataType)} to ${ctx.resolve(conversion.targetType)} is supported, but it is not recommended. Consider using explicit conversions.`,
    );
  }

  return applyActionToSnippet(ctx, value, action, conversion.targetType);
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
          const conversion = convertType(res.dataType as AnyData, type);
          if (!conversion) {
            return res;
          }

          return applyConversion(ctx, res, conversion);
        })
      : [];

    // Assuming that `id` is callable
    const fnRes = (idValue as unknown as (...args: unknown[]) => unknown)(
      ...(convertedResources.length > 0
        ? convertedResources
        : resolvedSnippets),
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

    if (isMarkedInternal(callee)) {
      const argTypes = callee[$internal]?.argTypes;

      if (typeof argTypes === 'object' && argTypes !== null) {
        const propKeys = Object.keys(argTypes);
        const objWithSnippets: Record<string, Snippet> = {};

        for (const key of propKeys) {
          const val = obj[key];
          if (val === undefined) {
            throw new Error(
              `Missing property ${key} in object literal for function ${callee}`,
            );
          }
          objWithSnippets[key] = generateExpression(ctx, val);
        }

        return {
          value: objWithSnippets,
          dataType: UnknownData,
        };
      }
    }

    return {
      value: generateEntries(Object.values(obj)),
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

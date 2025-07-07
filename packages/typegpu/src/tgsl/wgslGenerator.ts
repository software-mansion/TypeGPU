import * as tinyest from 'tinyest';
import { arrayOf } from '../data/array.ts';
import {
  type AnyData,
  isData,
  isLooseData,
  snip,
  type Snippet,
  UnknownData,
} from '../data/dataTypes.ts';
import * as d from '../data/index.ts';
import { abstractInt } from '../data/numeric.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { getName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import { type FnArgsConversionHint, isMarkedInternal } from '../types.ts';
import {
  coerceToSnippet,
  concretize,
  convertStructValues,
  convertToCommonType,
  type GenerationCtx,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  numericLiteralToSnippet,
} from './generationHelpers.ts';
import { ResolutionError } from '../errors.ts';

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
    return snip(expression ? 'true' : 'false', d.bool);
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

    const forcedType = expression[0] === NODE.assignmentExpr
      ? [lhsExpr.dataType as AnyData]
      : [];

    const converted = convertToCommonType(
      ctx,
      [lhsExpr, rhsExpr],
      forcedType,
    ) as
      | [Snippet, Snippet]
      | undefined;
    const [convLhs, convRhs] = converted || [lhsExpr, rhsExpr];

    const lhsStr = ctx.resolve(convLhs.value);
    const rhsStr = ctx.resolve(convRhs.value);
    const type = operatorToType(convLhs.dataType, op, convRhs.dataType);

    return snip(
      parenthesizedOps.includes(op)
        ? `(${lhsStr} ${op} ${rhsStr})`
        : `${lhsStr} ${op} ${rhsStr}`,
      type,
    );
  }

  if (expression[0] === NODE.postUpdate) {
    // Post-Update Expression
    const [_, op, arg] = expression;
    const argExpr = generateExpression(ctx, arg);
    const argStr = ctx.resolve(argExpr.value);

    return snip(`${argStr}${op}`, argExpr.dataType);
  }

  if (expression[0] === NODE.unaryExpr) {
    // Unary Expression
    const [_, op, arg] = expression;
    const argExpr = generateExpression(ctx, arg);
    const argStr = ctx.resolve(argExpr.value);

    const type = operatorToType(argExpr.dataType, op);
    return snip(`${op}${argStr}`, type);
  }

  if (expression[0] === NODE.memberAccess) {
    // Member Access
    const [_, targetNode, property] = expression;
    const target = generateExpression(ctx, targetNode);

    if (target.dataType.type === 'unknown') {
      // No idea what the type is, so we act on the snippet's value and try to guess

      // biome-ignore lint/suspicious/noExplicitAny: we're inspecting the value, and it could be any value
      const propValue = (target.value as any)[property];

      // We try to extract any type information based on the prop's value
      return coerceToSnippet(propValue);
    }

    if (wgsl.isPtr(target.dataType)) {
      return snip(
        `(*${ctx.resolve(target.value)}).${property}`,
        getTypeForPropAccess(target.dataType.inner as AnyData, property),
      );
    }

    if (wgsl.isWgslArray(target.dataType) && property === 'length') {
      if (target.dataType.elementCount === 0) {
        // Dynamically-sized array
        return snip(`arrayLength(&${ctx.resolve(target.value)})`, d.u32);
      }

      return snip(String(target.dataType.elementCount), abstractInt);
    }

    if (wgsl.isMat(target.dataType) && property === 'columns') {
      return snip(target.value, target.dataType);
    }

    if (
      wgsl.isVec(target.dataType) && wgsl.isVecInstance(target.value)
    ) {
      // We're operating on a vector that's known at resolution time
      // biome-ignore lint/suspicious/noExplicitAny: it's probably a swizzle
      return coerceToSnippet((target.value as any)[property]);
    }

    return snip(
      `${ctx.resolve(target.value)}.${property}`,
      getTypeForPropAccess(target.dataType, property),
    );
  }

  if (expression[0] === NODE.indexAccess) {
    // Index Access
    const [_, targetNode, propertyNode] = expression;
    const target = generateExpression(ctx, targetNode);
    const property = generateExpression(ctx, propertyNode);
    const targetStr = ctx.resolve(target.value);
    const propertyStr = ctx.resolve(property.value);

    if (target.dataType.type === 'unknown') {
      // No idea what the type is, so we act on the snippet's value and try to guess

      if (
        Array.isArray(propertyNode) && propertyNode[0] === NODE.numericLiteral
      ) {
        return coerceToSnippet(
          // biome-ignore lint/suspicious/noExplicitAny: we're inspecting the value, and it could be any value
          (target.value as any)[propertyNode[1] as number],
        );
      }

      throw new Error(
        `Cannot index value ${targetStr} of unknown type with index ${propertyStr}`,
      );
    }

    if (wgsl.isPtr(target.dataType)) {
      return snip(
        `(*${targetStr})[${propertyStr}]`,
        getTypeForIndexAccess(target.dataType.inner as AnyData),
      );
    }

    return snip(
      `${targetStr}[${propertyStr}]`,
      isData(target.dataType)
        ? getTypeForIndexAccess(target.dataType)
        : UnknownData,
    );
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

    ctx.callStack.push(id.value);

    const argSnippets = args.map((arg) => generateExpression(ctx, arg));
    const resolvedSnippets = argSnippets.map((res) =>
      snip(ctx.resolve(res.value), res.dataType)
    );
    const argValues = resolvedSnippets.map((res) => res.value);

    ctx.callStack.pop();

    resolvedSnippets.forEach((sn, idx) => {
      if (sn.dataType === UnknownData) {
        throw new Error(
          `Tried to pass '${sn.value}' of unknown type as argument #${idx} to '${
            typeof id.value === 'string'
              ? id.value
              : getName(id.value) ?? '<unnamed>'
          }()'`,
        );
      }
    });

    if (typeof id.value === 'string') {
      return snip(`${id.value}(${argValues.join(', ')})`, id.dataType);
    }

    if (wgsl.isWgslStruct(id.value)) {
      const resolvedId = ctx.resolve(id.value);

      return snip(
        `${resolvedId}(${argValues.join(', ')})`,
        // Unintuitive, but the type of the return value is the struct itself
        id.value,
      );
    }

    if (!isMarkedInternal(id.value)) {
      throw new Error(
        `Function ${String(id.value)} ${
          getName(id.value)
        } has not been created using TypeGPU APIs. Did you mean to wrap the function with tgpu.fn(args, return)(...) ?`,
      );
    }

    const argTypes = id.value[$internal]?.argTypes as
      | FnArgsConversionHint
      | undefined;
    let convertedResources: Snippet[];
    try {
      if (!argTypes || argTypes === 'keep') {
        convertedResources = resolvedSnippets;
      } else if (argTypes === 'coerce') {
        convertedResources = convertToCommonType(ctx, resolvedSnippets) ??
          resolvedSnippets;
      } else {
        const pairs =
          (Array.isArray(argTypes) ? argTypes : (argTypes(...resolvedSnippets)))
            .map((type, i) => [type, resolvedSnippets[i] as Snippet] as const);

        convertedResources = pairs.map(([type, sn]) => {
          if (sn.dataType.type === 'unknown') {
            console.warn(
              `Internal error: unknown type when generating expression: ${expression}`,
            );
            return sn;
          }

          const conv = convertToCommonType(ctx, [sn], [type])?.[0];
          if (!conv) {
            throw new ResolutionError(
              `Cannot convert argument of type '${sn.dataType.type}' to '${type.type}' for function ${
                getName(id.value)
              }`,
              [{
                function: id.value,
                callStack: ctx.callStack,
                error:
                  `Cannot convert argument of type '${sn.dataType.type}' to '${type.type}'`,
                toString: () => getName(id.value),
              }],
            );
          }
          return conv;
        });
      }

      // Assuming that `id` is callable
      const fnRes = (id.value as unknown as (...args: unknown[]) => unknown)(
        ...convertedResources,
      ) as Snippet;
      return snip(ctx.resolve(fnRes.value), fnRes.dataType);
    } catch (error) {
      throw new ResolutionError(error, [{
        toString: () => getName(id.value),
      }]);
    }
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

      return snip(
        convertedValues.map((v) => ctx.resolve(v.value)).join(', '),
        callee,
      );
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

        return snip(snippets, UnknownData);
      }
    }

    throw new Error(
      'Object expressions are only allowed as return values of functions or as arguments to structs.',
    );
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
    const arrayValues = convertedValues.map((sn) => ctx.resolve(sn.value));

    return snip(
      `${arrayType}( ${arrayValues.join(', ')} )`,
      arrayOf(
        type as wgsl.AnyWgslData,
        values.length,
      ) as wgsl.AnyWgslData,
    );
  }

  if (expression[0] === NODE.stringLiteral) {
    throw new Error('Cannot use string literals in TGSL.');
  }

  if (expression[0] === NODE.preUpdate) {
    throw new Error('Cannot use pre-updates in TGSL.');
  }

  assertExhaustive(expression);
}

function blockifySingleStatement(statement: tinyest.Statement): tinyest.Block {
  return typeof statement !== 'object' ||
      statement[0] !== NODE.block
    ? [NODE.block, [statement]]
    : statement;
}

export function generateStatement(
  ctx: GenerationCtx,
  statement: tinyest.Statement,
): string {
  if (typeof statement === 'string') {
    return `${ctx.pre}${
      ctx.resolve(generateIdentifier(ctx, statement).value)
    };`;
  }

  if (typeof statement === 'boolean') {
    return `${ctx.pre}${statement ? 'true' : 'false'};`;
  }

  if (statement[0] === NODE.return) {
    const returnNode = statement[1];
    const returnValue = returnNode !== undefined
      ? ctx.resolve(generateExpression(ctx, returnNode).value)
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
    const condition = ctx.resolve(condSnippet.value);

    ctx.indent(); // {
    const consequent = generateStatement(ctx, blockifySingleStatement(cons));
    ctx.dedent(); // }

    ctx.indent(); // {
    const alternate = alt
      ? generateStatement(ctx, blockifySingleStatement(alt))
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

  if (statement[0] === NODE.let || statement[0] === NODE.const) {
    const [_, rawId, rawValue] = statement;
    const eq = rawValue !== undefined
      ? generateExpression(ctx, rawValue)
      : undefined;

    if (!eq) {
      throw new Error(
        `Cannot create variable '${rawId}' without an initial value.`,
      );
    }

    if (isLooseData(eq.dataType)) {
      throw new Error(
        `Cannot create variable '${rawId}' with loose data type.`,
      );
    }

    registerBlockVariable(
      ctx,
      rawId,
      concretize(eq.dataType as wgsl.AnyWgslData),
    );
    const id = ctx.resolve(generateIdentifier(ctx, rawId).value);

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
        convertedValues.map((sn) => ctx.resolve(sn.value)).join(', ')
      });`;
    }

    return `${ctx.pre}var ${id} = ${ctx.resolve(eq.value)};`;
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
    const conditionStr = condSnippet ? ctx.resolve(condSnippet.value) : '';

    const updateStatement = update ? generateStatement(ctx, update) : undefined;
    const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

    ctx.indent();
    const bodyStr = generateStatement(ctx, blockifySingleStatement(body));
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
    const conditionStr = ctx.resolve(condSnippet.value);

    ctx.indent();
    const bodyStr = generateStatement(ctx, blockifySingleStatement(body));
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

  return `${ctx.pre}${ctx.resolve(generateExpression(ctx, statement).value)};`;
}

export function generateFunction(
  ctx: GenerationCtx,
  body: tinyest.Block,
): string {
  return generateBlock(ctx, body);
}

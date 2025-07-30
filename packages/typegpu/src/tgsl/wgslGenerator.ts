import * as tinyest from 'tinyest';
import { arrayOf } from '../data/array.ts';
import {
  type AnyData,
  InfixDispatch,
  isData,
  isLooseData,
  UnknownData,
} from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { abstractInt, bool, f16, f32, u32 } from '../data/numeric.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { ResolutionError } from '../errors.ts';
import { getName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import { add, div, mul, sub } from '../std/numeric.ts';
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
  tryConvertSnippet,
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

const infixKinds = [
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2h',
  'vec3h',
  'vec4h',
  'vec2i',
  'vec3i',
  'vec4i',
  'vec2u',
  'vec3u',
  'vec4u',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
];

export const infixOperators = {
  add,
  sub,
  mul,
  div,
} as const;

export type InfixOperator = keyof typeof infixOperators;

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

export function generateBlock(
  ctx: GenerationCtx,
  [_, statements]: tinyest.Block,
): string {
  ctx.pushBlockScope();
  try {
    ctx.indent();
    const body = statements.map((statement) =>
      generateStatement(ctx, statement)
    ).join('\n');
    ctx.dedent();
    return `{
${body}
${ctx.pre}}`;
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

/**
 * A wrapper for `generateExpression` that updates `ctx.expectedTypeStack`
 * and tries to convert the result when it does not match the expected type.
 */
export function generateTypedExpression(
  ctx: GenerationCtx,
  expression: tinyest.Expression,
  expectedType: AnyData,
) {
  ctx.expectedTypeStack.push(expectedType);
  const result = generateExpression(ctx, expression);
  ctx.expectedTypeStack.pop();
  return tryConvertSnippet(ctx, result, expectedType);
}

export function generateExpression(
  ctx: GenerationCtx,
  expression: tinyest.Expression,
): Snippet {
  if (typeof expression === 'string') {
    return generateIdentifier(ctx, expression);
  }

  if (typeof expression === 'boolean') {
    return snip(expression ? 'true' : 'false', bool);
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
      ? lhsExpr.dataType.type === 'ptr'
        ? [lhsExpr.dataType.inner as AnyData]
        : [lhsExpr.dataType as AnyData]
      : undefined;

    const converted = convertToCommonType(
      ctx,
      [lhsExpr, rhsExpr],
      op === '/' ? [f32, f16] : forcedType,
      /* verbose */ op !== '/',
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

    if (
      infixKinds.includes(target.dataType.type) &&
      property in infixOperators
    ) {
      return {
        value: new InfixDispatch(
          property,
          target,
          infixOperators[property as InfixOperator][$internal].gpuImpl,
        ),
        dataType: UnknownData,
      };
    }

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
        return snip(`arrayLength(&${ctx.resolve(target.value)})`, u32);
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
    // Function Call.
    const [_, callee, args] = expression;
    const id = generateExpression(ctx, callee);

    if (wgsl.isWgslStruct(id.value) || wgsl.isWgslArray(id.value)) {
      // Struct/array schema call.
      if (args.length > 1) {
        throw new Error(
          'Type error: Array and struct schemas should always be called with at most 1 argument.',
        );
      }

      // No arguments `Struct()`, resolve struct name and return.
      if (!args[0]) {
        return snip(`${ctx.resolve(id.value)}()`, id.value);
      }

      const argSnippet = generateTypedExpression(
        ctx,
        args[0],
        id.value as AnyData,
      );

      // Either `Struct({ x: 1, y: 2 })`, or `Struct(otherStruct)`.
      // In both cases, we just let the argument resolve everything.
      return snip(ctx.resolve(argSnippet.value), id.value);
    }

    if (id.value instanceof InfixDispatch) {
      // Infix operator dispatch.
      if (!args[0]) {
        throw new Error(
          `Type error: An infix operator '${id.value.name}' was called without any arguments`,
        );
      }
      return id.value.operator(id.value.lhs, generateExpression(ctx, args[0]));
    }

    if (!isMarkedInternal(id.value)) {
      throw new Error(
        `Function ${String(id.value)} ${
          getName(id.value)
        } has not been created using TypeGPU APIs. Did you mean to wrap the function with tgpu.fn(args, return)(...) ?`,
      );
    }

    // Other, including tgsl functions, std and vector/matrix schema calls.

    const argConversionHint = id.value[$internal]
      ?.argConversionHint as FnArgsConversionHint;
    try {
      let convertedArguments: Snippet[];

      if (Array.isArray(argConversionHint)) {
        // The hint is an array of schemas.
        convertedArguments = args.map((arg, i) => {
          const argType = argConversionHint[i];
          if (!argType) {
            throw new Error(
              `Type error: Function '${
                getName(id.value)
              }' was called with too many arguments.`,
            );
          }
          return generateTypedExpression(ctx, arg, argType);
        });
      } else {
        const resolvedSnippets = args
          .map((arg) => generateExpression(ctx, arg))
          .map((res) => snip(ctx.resolve(res.value), res.dataType));

        if (!argConversionHint || argConversionHint === 'keep') {
          // The hint tells us to do nothing.
          convertedArguments = resolvedSnippets;
        } else if (argConversionHint === 'convert-arguments-to-common-type') {
          // The hint tells us to unify the types.
          convertedArguments = convertToCommonType(ctx, resolvedSnippets) ??
            resolvedSnippets;
        } else {
          // The hint is a function that converts the arguments.
          convertedArguments = argConversionHint(...resolvedSnippets)
            .map((type, i) => [type, resolvedSnippets[i] as Snippet] as const)
            .map(([type, sn]) => tryConvertSnippet(ctx, sn, type));
        }
      }
      // Assuming that `id` is callable
      const fnRes = (id.value as unknown as (...args: unknown[]) => unknown)(
        ...convertedArguments,
      ) as Snippet;
      // We need to reset the indentation level during function body resolution to ignore the indentation level of the function call
      return snip(
        ctx.withResetIndentLevel(() => ctx.resolve(fnRes.value)),
        fnRes.dataType,
      );
    } catch (error) {
      throw new ResolutionError(error, [{
        toString: () => getName(id.value),
      }]);
    }
  }

  if (expression[0] === NODE.objectExpr) {
    // Object Literal
    const obj = expression[1];

    const structType = ctx.expectedTypeStack.at(-1);

    if (!structType || !wgsl.isWgslStruct(structType)) {
      throw new Error(
        `Type error: No target type could be inferred for object with keys [${
          Object.keys(obj).join(', ')
        }], please wrap the object in the corresponding schema.`,
      );
    }

    const entries = Object.fromEntries(
      Object.entries(structType.propTypes).map(([key, value]) => {
        const val = obj[key];
        if (val === undefined) {
          throw new Error(
            `Type error: Missing property ${key} in object literal for struct ${structType}`,
          );
        }
        const result = generateTypedExpression(ctx, val, value as AnyData);
        return [key, result];
      }),
    );

    const convertedValues = convertStructValues(ctx, structType, entries);

    return snip(
      `${ctx.resolve(structType)}(${
        convertedValues.map((v) => ctx.resolve(v.value)).join(', ')
      })`,
      structType,
    );
  }

  if (expression[0] === NODE.arrayExpr) {
    const [_, valuesRaw] = expression;
    // Array Expression
    const arrType = ctx.expectedTypeStack.at(-1);
    let elemType = wgsl.isWgslArray(arrType) ? arrType.elementType : undefined;
    let values: Snippet[];

    if (elemType) {
      // The array is typed, so its elements should be as well.
      values = valuesRaw.map((value) =>
        generateTypedExpression(
          ctx,
          value as tinyest.Expression,
          elemType as AnyData,
        )
      );
    } else {
      // The array is not typed, so we try to guess the types.
      const valuesSnippets = valuesRaw.map((value) =>
        generateExpression(ctx, value as tinyest.Expression)
      );

      if (valuesSnippets.length === 0) {
        throw new Error(
          'Type error: Cannot infer the type of an empty array literal.',
        );
      }

      const maybeValues = convertToCommonType(ctx, valuesSnippets);
      if (!maybeValues) {
        throw new Error(
          'Type error: The given values cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema',
        );
      }

      values = maybeValues;
      elemType = concretize(values[0]?.dataType as wgsl.AnyWgslData);
    }

    const arrayType = `array<${ctx.resolve(elemType)}, ${values.length}>`;
    const arrayValues = values.map((sn) => ctx.resolve(sn.value));

    return snip(
      `${arrayType}( ${arrayValues.join(', ')} )`,
      arrayOf(
        elemType as wgsl.AnyWgslData,
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
      ? ctx.resolve(
        generateTypedExpression(
          ctx,
          returnNode,
          ctx.topFunctionReturnType,
        ).value,
      )
      : undefined;

    return returnValue
      ? `${ctx.pre}return ${returnValue};`
      : `${ctx.pre}return;`;
  }

  if (statement[0] === NODE.if) {
    const [_, cond, cons, alt] = statement;
    const condition = ctx.resolve(
      generateTypedExpression(ctx, cond, bool).value,
    );

    const consequent = generateBlock(ctx, blockifySingleStatement(cons));
    const alternate = alt
      ? generateBlock(ctx, blockifySingleStatement(alt))
      : undefined;

    if (!alternate) {
      return `${ctx.pre}if (${condition}) ${consequent}`;
    }

    return `\
${ctx.pre}if (${condition}) ${consequent}
${ctx.pre}else ${alternate}`;
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

    return `${ctx.pre}var ${id} = ${ctx.resolve(eq.value)};`;
  }

  if (statement[0] === NODE.block) {
    return generateBlock(ctx, statement);
  }

  if (statement[0] === NODE.for) {
    const [_, init, condition, update, body] = statement;

    const [initStatement, conditionExpr, updateStatement] = ctx
      .withResetIndentLevel(
        () => [
          init ? generateStatement(ctx, init) : undefined,
          condition ? generateExpression(ctx, condition) : undefined,
          update ? generateStatement(ctx, update) : undefined,
        ],
      );

    const initStr = initStatement ? initStatement.slice(0, -1) : '';

    const condSnippet = condition
      ? generateTypedExpression(ctx, condition, bool)
      : undefined;
    const conditionStr = condSnippet ? ctx.resolve(condSnippet.value) : '';

    const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

    const bodyStr = generateBlock(ctx, blockifySingleStatement(body));
    return `${ctx.pre}for (${initStr}; ${conditionStr}; ${updateStr}) ${bodyStr}`;
  }

  if (statement[0] === NODE.while) {
    const [_, condition, body] = statement;
    const condSnippet = generateTypedExpression(ctx, condition, bool);
    const conditionStr = ctx.resolve(condSnippet.value);

    const bodyStr = generateBlock(ctx, blockifySingleStatement(body));
    return `${ctx.pre}while (${conditionStr}) ${bodyStr}`;
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

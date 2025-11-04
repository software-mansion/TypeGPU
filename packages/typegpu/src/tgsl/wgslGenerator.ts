import * as tinyest from 'tinyest';
import { stitch, stitchWithExactTypes } from '../core/resolve/stitch.ts';
import { arrayOf } from '../data/array.ts';
import {
  type AnyData,
  ConsoleLog,
  InfixDispatch,
  isData,
  isLooseData,
  MatrixColumnsAccess,
  UnknownData,
} from '../data/dataTypes.ts';
import { abstractInt, bool, u32 } from '../data/numeric.ts';
import { isSnippet, snip, type Snippet } from '../data/snippet.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { invariant, ResolutionError, WgslTypeError } from '../errors.ts';
import { getName } from '../shared/meta.ts';
import { isMarkedInternal } from '../shared/symbols.ts';
import { safeStringify } from '../shared/stringify.ts';
import { $internal } from '../shared/symbols.ts';
import { pow } from '../std/numeric.ts';
import { add, div, mul, sub } from '../std/operators.ts';
import type { FnArgsConversionHint } from '../types.ts';
import {
  convertStructValues,
  convertToCommonType,
  tryConvertSnippet,
} from './conversion.ts';
import {
  coerceToSnippet,
  concretize,
  type GenerationCtx,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  numericLiteralToSnippet,
} from './generationHelpers.ts';
import type { ShaderGenerator } from './shaderGenerator.ts';
import { constant } from '../core/constant/tgpuConstant.ts';

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

const opCodeToCodegen = {
  '+': add[$internal].gpuImpl,
  '-': sub[$internal].gpuImpl,
  '*': mul[$internal].gpuImpl,
  '/': div[$internal].gpuImpl,
  '**': pow[$internal].gpuImpl,
} satisfies Partial<
  Record<tinyest.BinaryOperator, (...args: never[]) => unknown>
>;

class WgslGenerator implements ShaderGenerator {
  #ctx: GenerationCtx | undefined = undefined;

  public initGenerator(ctx: GenerationCtx) {
    this.#ctx = ctx;
  }

  private get ctx(): GenerationCtx {
    if (!this.#ctx) {
      throw new Error(
        'WGSL Generator has not yet been initialized. Please call initialize(ctx) before using the generator.',
      );
    }
    return this.#ctx;
  }

  public block(
    [_, statements]: tinyest.Block,
  ): string {
    this.ctx.pushBlockScope();
    try {
      this.ctx.indent();
      const body = statements.map((statement) => this.statement(statement))
        .join('\n');
      this.ctx.dedent();
      return `{
${body}
${this.ctx.pre}}`;
    } finally {
      this.ctx.popBlockScope();
    }
  }

  public blockVariable(
    id: string,
    dataType: wgsl.AnyWgslData | UnknownData,
  ): Snippet {
    const snippet = snip(this.ctx.makeNameValid(id), dataType);
    this.ctx.defineVariable(id, snippet);
    return snippet;
  }

  public identifier(id: string): Snippet {
    if (!id) {
      throw new Error('Cannot resolve an empty identifier');
    }
    const res = this.ctx.getById(id);

    if (!res) {
      throw new Error(`Identifier ${id} not found`);
    }

    return res;
  }

  /**
   * A wrapper for `generateExpression` that updates `ctx.expectedType`
   * and tries to convert the result when it does not match the expected type.
   */
  public typedExpression(
    expression: tinyest.Expression,
    expectedType: AnyData,
  ) {
    const prevExpectedType = this.ctx.expectedType;
    this.ctx.expectedType = expectedType;

    try {
      const result = this.expression(expression);
      return tryConvertSnippet(result, expectedType);
    } finally {
      this.ctx.expectedType = prevExpectedType;
    }
  }

  public expression(
    expression: tinyest.Expression,
  ): Snippet {
    if (typeof expression === 'string') {
      return this.identifier(expression);
    }

    if (typeof expression === 'boolean') {
      return snip(expression, bool);
    }

    if (
      expression[0] === NODE.logicalExpr ||
      expression[0] === NODE.binaryExpr ||
      expression[0] === NODE.assignmentExpr
    ) {
      // Logical/Binary/Assignment Expression
      const [_, lhs, op, rhs] = expression;
      const lhsExpr = this.expression(lhs);
      const rhsExpr = this.expression(rhs);

      const codegen = opCodeToCodegen[op as keyof typeof opCodeToCodegen];
      if (codegen) {
        return codegen(lhsExpr, rhsExpr);
      }

      const forcedType = expression[0] === NODE.assignmentExpr
        ? lhsExpr.dataType.type === 'ptr'
          ? [lhsExpr.dataType.inner as AnyData]
          : [lhsExpr.dataType as AnyData]
        : undefined;

      const [convLhs, convRhs] =
        convertToCommonType([lhsExpr, rhsExpr], forcedType) ??
          [lhsExpr, rhsExpr];

      const lhsStr = this.ctx.resolve(convLhs.value, convLhs.dataType).value;
      const rhsStr = this.ctx.resolve(convRhs.value, convRhs.dataType).value;
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
      const argExpr = this.expression(arg);
      const argStr = this.ctx.resolve(argExpr.value).value;

      return snip(`${argStr}${op}`, argExpr.dataType);
    }

    if (expression[0] === NODE.unaryExpr) {
      // Unary Expression
      const [_, op, arg] = expression;
      const argExpr = this.expression(arg);
      const argStr = this.ctx.resolve(argExpr.value).value;

      const type = operatorToType(argExpr.dataType, op);
      return snip(`${op}${argStr}`, type);
    }

    if (expression[0] === NODE.memberAccess) {
      // Member Access
      const [_, targetNode, property] = expression;
      const target = this.expression(targetNode);

      if (target.value === console) {
        return snip(
          new ConsoleLog(property),
          UnknownData,
        );
      }

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
          `(*${this.ctx.resolve(target.value).value}).${property}`,
          getTypeForPropAccess(target.dataType.inner as AnyData, property),
        );
      }

      if (wgsl.isWgslArray(target.dataType) && property === 'length') {
        if (target.dataType.elementCount === 0) {
          // Dynamically-sized array
          return snip(
            `arrayLength(&${this.ctx.resolve(target.value).value})`,
            u32,
          );
        }

        return snip(String(target.dataType.elementCount), abstractInt);
      }

      if (wgsl.isMat(target.dataType) && property === 'columns') {
        return snip(new MatrixColumnsAccess(target), UnknownData);
      }

      if (
        wgsl.isVec(target.dataType) && wgsl.isVecInstance(target.value)
      ) {
        // We're operating on a vector that's known at resolution time
        // biome-ignore lint/suspicious/noExplicitAny: it's probably a swizzle
        return coerceToSnippet((target.value as any)[property]);
      }

      return snip(
        `${this.ctx.resolve(target.value).value}.${property}`,
        getTypeForPropAccess(target.dataType, property),
      );
    }

    if (expression[0] === NODE.indexAccess) {
      // Index Access
      const [_, targetNode, propertyNode] = expression;
      const target = this.expression(targetNode);
      const property = this.expression(propertyNode);
      const propertyStr =
        this.ctx.resolve(property.value, property.dataType).value;

      if (target.value instanceof MatrixColumnsAccess) {
        return snip(
          stitch`${target.value.matrix}[${propertyStr}]`,
          getTypeForIndexAccess(target.value.matrix.dataType as AnyData),
        );
      }
      const targetStr = this.ctx.resolve(target.value, target.dataType).value;

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
          `Unable to index a value of unknown type with index ${propertyStr}. If the value is an array, to address this, consider one of the following approaches: (1) declare the array using 'tgpu.const', (2) store the array in a buffer, or (3) define the array within the GPU function scope.`,
        );
      }

      if (wgsl.isMat(target.dataType)) {
        throw new Error(
          "The only way of accessing matrix elements in TGSL is through the 'columns' property.",
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
      const type = typeof expression[1] === 'string'
        ? numericLiteralToSnippet(parseNumericString(expression[1]))
        : numericLiteralToSnippet(expression[1]);
      if (!type) {
        throw new Error(`Invalid numeric literal ${expression[1]}`);
      }
      return type;
    }

    if (expression[0] === NODE.call) {
      // Function Call
      const [_, calleeNode, argNodes] = expression;
      const callee = this.expression(calleeNode);

      if (wgsl.isWgslStruct(callee.value) || wgsl.isWgslArray(callee.value)) {
        // Struct/array schema call.
        if (argNodes.length > 1) {
          throw new WgslTypeError(
            'Array and struct schemas should always be called with at most 1 argument',
          );
        }

        // No arguments `Struct()`, resolve struct name and return.
        if (!argNodes[0]) {
          // the schema becomes the data type
          return snip(
            `${this.ctx.resolve(callee.value).value}()`,
            callee.value,
          );
        }

        const arg = this.typedExpression(
          argNodes[0],
          callee.value,
        );

        // Either `Struct({ x: 1, y: 2 })`, or `Struct(otherStruct)`.
        // In both cases, we just let the argument resolve everything.
        return snip(
          this.ctx.resolve(arg.value, callee.value).value,
          callee.value,
        );
      }

      if (callee.value === constant) {
        throw new Error(
          'Constants cannot be defined within TypeGPU function scope. To address this, move the constant definition outside the function scope.',
        );
      }

      if (callee.value instanceof InfixDispatch) {
        // Infix operator dispatch.
        if (!argNodes[0]) {
          throw new WgslTypeError(
            `An infix operator '${callee.value.name}' was called without any arguments`,
          );
        }
        const rhs = this.expression(argNodes[0]);
        return callee.value.operator(callee.value.lhs, rhs);
      }

      if (!isMarkedInternal(callee.value)) {
        const args = argNodes.map((arg) => this.expression(arg));
        const shellless = this.ctx.shelllessRepo.get(
          callee.value as (...args: never[]) => unknown,
          args,
        );
        if (shellless) {
          return this.ctx.withResetIndentLevel(() => {
            const snippet = this.ctx.resolve(shellless);
            return snip(stitch`${snippet.value}(${args})`, snippet.dataType);
          });
        }

        throw new Error(
          `Function '${
            getName(callee.value) ?? String(callee.value)
          }' is not marked with the 'use gpu' directive and cannot be used in a shader`,
        );
      }

      // Other, including tgsl functions, std and vector/matrix schema calls.

      const argConversionHint =
        (callee.value[$internal] as Record<string, unknown>)
          ?.argConversionHint as FnArgsConversionHint ?? 'keep';
      try {
        let convertedArguments: Snippet[];

        if (Array.isArray(argConversionHint)) {
          // The hint is an array of schemas.
          convertedArguments = argNodes.map((arg, i) => {
            const argType = argConversionHint[i];
            if (!argType) {
              throw new WgslTypeError(
                `Function '${
                  getName(callee.value)
                }' was called with too many arguments`,
              );
            }
            return this.typedExpression(arg, argType);
          });
        } else {
          const snippets = argNodes.map((arg) => this.expression(arg));

          if (argConversionHint === 'keep') {
            // The hint tells us to do nothing.
            convertedArguments = snippets;
          } else if (argConversionHint === 'unify') {
            // The hint tells us to unify the types.
            convertedArguments = convertToCommonType(snippets) ?? snippets;
          } else {
            // The hint is a function that converts the arguments.
            convertedArguments = argConversionHint(...snippets)
              .map((type, i) => [type, snippets[i] as Snippet] as const)
              .map(([type, sn]) => tryConvertSnippet(sn, type));
          }
        }

        if (callee.value instanceof ConsoleLog) {
          return this.ctx.generateLog(callee.value.op, convertedArguments);
        }

        // Assuming that `callee` is callable
        const fnRes =
          (callee.value as unknown as (...args: unknown[]) => unknown)(
            ...convertedArguments,
          );

        if (!isSnippet(fnRes)) {
          throw new Error(
            'Functions running in codegen mode must return snippets',
          );
        }
        return fnRes;
      } catch (error) {
        throw new ResolutionError(error, [{
          toString: () => getName(callee.value),
        }]);
      }
    }

    if (expression[0] === NODE.objectExpr) {
      // Object Literal
      const obj = expression[1];

      const structType = this.ctx.expectedType;

      if (!structType || !wgsl.isWgslStruct(structType)) {
        throw new WgslTypeError(
          `No target type could be inferred for object with keys [${
            Object.keys(obj).join(', ')
          }], please wrap the object in the corresponding schema.`,
        );
      }

      const entries = Object.fromEntries(
        Object.entries(structType.propTypes).map(([key, value]) => {
          const val = obj[key];
          if (val === undefined) {
            throw new WgslTypeError(
              `Missing property ${key} in object literal for struct ${structType}`,
            );
          }
          const result = this.typedExpression(
            val,
            value as AnyData,
          );
          return [key, result];
        }),
      );

      const convertedSnippets = convertStructValues(structType, entries);

      return snip(
        stitch`${this.ctx.resolve(structType).value}(${convertedSnippets})`,
        structType,
      );
    }

    if (expression[0] === NODE.arrayExpr) {
      const [_, valueNodes] = expression;
      // Array Expression
      const arrType = this.ctx.expectedType;
      let elemType: AnyData;
      let values: Snippet[];

      if (wgsl.isWgslArray(arrType)) {
        elemType = arrType.elementType as AnyData;
        // The array is typed, so its elements should be as well.
        values = valueNodes.map((value) =>
          this.typedExpression(value, elemType)
        );
        // Since it's an expected type, we enforce the length
        if (values.length !== arrType.elementCount) {
          throw new WgslTypeError(
            `Cannot create value of type '${arrType}' from an array of length: ${values.length}`,
          );
        }
      } else {
        // The array is not typed, so we try to guess the types.
        const valuesSnippets = valueNodes.map((value) =>
          this.expression(value as tinyest.Expression)
        );

        if (valuesSnippets.length === 0) {
          throw new WgslTypeError(
            'Cannot infer the type of an empty array literal.',
          );
        }

        const converted = convertToCommonType(valuesSnippets);
        if (!converted) {
          throw new WgslTypeError(
            'The given values cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema',
          );
        }

        values = converted;
        elemType = concretize(values[0]?.dataType as wgsl.AnyWgslData);
      }

      const arrayType = `array<${
        this.ctx.resolve(elemType).value
      }, ${values.length}>`;

      return snip(
        stitch`${arrayType}(${values})`,
        arrayOf[$internal].jsImpl(
          elemType as wgsl.AnyWgslData,
          values.length,
        ) as wgsl.AnyWgslData,
      );
    }

    if (expression[0] === NODE.stringLiteral) {
      return snip(expression[1], UnknownData);
    }

    if (expression[0] === NODE.preUpdate) {
      throw new Error('Cannot use pre-updates in TGSL.');
    }

    assertExhaustive(expression);
  }

  public functionDefinition(
    body: tinyest.Block,
  ): string {
    return this.block(body);
  }

  public statement(
    statement: tinyest.Statement,
  ): string {
    if (typeof statement === 'string') {
      return `${this.ctx.pre}${
        this.ctx.resolve(this.identifier(statement).value).value
      };`;
    }

    if (typeof statement === 'boolean') {
      return `${this.ctx.pre}${statement ? 'true' : 'false'};`;
    }

    if (statement[0] === NODE.return) {
      const returnNode = statement[1];

      if (returnNode !== undefined) {
        const expectedReturnType = this.ctx.topFunctionReturnType;
        const returnSnippet = expectedReturnType
          ? this.typedExpression(
            returnNode,
            expectedReturnType,
          )
          : this.expression(returnNode);

        invariant(
          returnSnippet.dataType.type !== 'unknown',
          'Return type should be known',
        );

        this.ctx.reportReturnType(returnSnippet.dataType);
        return stitch`${this.ctx.pre}return ${returnSnippet};`;
      }

      return `${this.ctx.pre}return;`;
    }

    if (statement[0] === NODE.if) {
      const [_, condNode, consNode, altNode] = statement;
      const condition = this.typedExpression(condNode, bool);

      const consequent = condition.value === false
        ? undefined
        : this.block(blockifySingleStatement(consNode));
      const alternate = condition.value === true || !altNode
        ? undefined
        : this.block(blockifySingleStatement(altNode));

      if (condition.value === true) {
        return `${this.ctx.pre}${consequent}`;
      }

      if (condition.value === false) {
        return alternate ? `${this.ctx.pre}${alternate}` : '';
      }

      if (!alternate) {
        return stitch`${this.ctx.pre}if (${condition}) ${consequent}`;
      }

      return stitch`\
${this.ctx.pre}if (${condition}) ${consequent}
${this.ctx.pre}else ${alternate}`;
    }

    if (statement[0] === NODE.let || statement[0] === NODE.const) {
      const [_, rawId, rawValue] = statement;
      const eq = rawValue !== undefined ? this.expression(rawValue) : undefined;

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

      const snippet = this.blockVariable(
        rawId,
        concretize(eq.dataType as wgsl.AnyWgslData),
      );
      return stitchWithExactTypes`${this.ctx.pre}var ${snippet
        .value as string} = ${eq};`;
    }

    if (statement[0] === NODE.block) {
      return this.block(statement);
    }

    if (statement[0] === NODE.for) {
      const [_, init, condition, update, body] = statement;

      const [initStatement, conditionExpr, updateStatement] = this.ctx
        .withResetIndentLevel(
          () => [
            init ? this.statement(init) : undefined,
            condition ? this.typedExpression(condition, bool) : undefined,
            update ? this.statement(update) : undefined,
          ],
        );

      const initStr = initStatement ? initStatement.slice(0, -1) : '';
      const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

      const bodyStr = this.block(blockifySingleStatement(body));
      return stitch`${this.ctx.pre}for (${initStr}; ${conditionExpr}; ${updateStr}) ${bodyStr}`;
    }

    if (statement[0] === NODE.while) {
      const [_, condition, body] = statement;
      const condSnippet = this.typedExpression(condition, bool);
      const conditionStr = this.ctx.resolve(condSnippet.value).value;

      const bodyStr = this.block(blockifySingleStatement(body));
      return `${this.ctx.pre}while (${conditionStr}) ${bodyStr}`;
    }

    if (statement[0] === NODE.continue) {
      return `${this.ctx.pre}continue;`;
    }

    if (statement[0] === NODE.break) {
      return `${this.ctx.pre}break;`;
    }

    return `${this.ctx.pre}${
      this.ctx.resolve(this.expression(statement).value).value
    };`;
  }
}

function assertExhaustive(value: never): never {
  throw new Error(
    `'${safeStringify(value)}' was not handled by the WGSL generator.`,
  );
}

function parseNumericString(str: string): number {
  // Hex literals
  if (/^0x[0-9a-f]+$/i.test(str)) {
    return Number.parseInt(str);
  }

  // Binary literals
  if (/^0b[01]+$/i.test(str)) {
    return Number.parseInt(str.slice(2), 2);
  }

  return Number.parseFloat(str);
}

function blockifySingleStatement(statement: tinyest.Statement): tinyest.Block {
  return typeof statement !== 'object' ||
      statement[0] !== NODE.block
    ? [NODE.block, [statement]]
    : statement;
}

const wgslGenerator: WgslGenerator = new WgslGenerator();
export default wgslGenerator;

import * as tinyest from 'tinyest';
import { stitch } from '../core/resolve/stitch.ts';
import { arrayOf } from '../data/array.ts';
import {
  ConsoleLog,
  InfixDispatch,
  isLooseData,
  UnknownData,
  unptr,
} from '../data/dataTypes.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import {
  isEphemeralOrigin,
  isEphemeralSnippet,
  type Origin,
  snip,
  type Snippet,
} from '../data/snippet.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { invariant, ResolutionError, WgslTypeError } from '../errors.ts';
import { getName } from '../shared/meta.ts';
import {
  $gpuCallable,
  $internal,
  $providing,
  isMarkedInternal,
} from '../shared/symbols.ts';
import { safeStringify } from '../shared/stringify.ts';
import { pow } from '../std/numeric.ts';
import { add, div, mul, neg, sub } from '../std/operators.ts';
import { isGPUCallable, isKnownAtComptime } from '../types.ts';
import {
  convertStructValues,
  convertToCommonType,
  tryConvertSnippet,
} from './conversion.ts';
import {
  ArrayExpression,
  coerceToSnippet,
  concretize,
  type GenerationCtx,
  numericLiteralToSnippet,
} from './generationHelpers.ts';
import { accessIndex } from './accessIndex.ts';
import { accessProp } from './accessProp.ts';
import type { ShaderGenerator } from './shaderGenerator.ts';
import { createPtrFromOrigin, implicitFrom, ptrFn } from '../data/ptr.ts';
import { RefOperator } from '../data/ref.ts';
import { constant } from '../core/constant/tgpuConstant.ts';
import { UnrollableIterable } from '../core/unroll/tgpuUnroll.ts';
import { isGenericFn } from '../core/function/tgpuFn.ts';
import type { AnyFn } from '../core/function/fnTypes.ts';
import { AutoStruct } from '../data/autoStruct.ts';
import { mathToStd } from './math.ts';
import type { ExternalMap } from '../core/resolve/externals.ts';
import * as forOfUtils from './forOfUtils.ts';

const { NodeTypeCatalog: NODE } = tinyest;

const parenthesizedOps = [
  '==',
  '!=',
  '===',
  '!==',
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

const binaryLogicalOps = [
  '&&',
  '||',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
];

const OP_MAP = {
  //
  // binary
  //
  '===': '==',
  '!==': '!=',
  get '>>>'(): never {
    throw new Error('The `>>>` operator is unsupported in TypeGPU functions.');
  },
  get in(): never {
    throw new Error('The `in` operator is unsupported in TypeGPU functions.');
  },
  get instanceof(): never {
    throw new Error(
      'The `instanceof` operator is unsupported in TypeGPU functions.',
    );
  },
  get '|>'(): never {
    throw new Error('The `|>` operator is unsupported in TypeGPU functions.');
  },
  //
  // logical
  //
  get '??'(): never {
    throw new Error('The `??` operator is unsupported in TypeGPU functions.');
  },
  //
  // assignment
  //
  get '>>>='(): never {
    throw new Error('The `>>>=` operator is unsupported in TypeGPU functions.');
  },
  get '**='(): never {
    throw new Error('The `**=` operator is unsupported in TypeGPU functions.');
  },
  get '??='(): never {
    throw new Error('The `??=` operator is unsupported in TypeGPU functions.');
  },
  get '&&='(): never {
    throw new Error('The `&&=` operator is unsupported in TypeGPU functions.');
  },
  get '||='(): never {
    throw new Error('The `||=` operator is unsupported in TypeGPU functions.');
  },
} as Record<string, string>;

type Operator =
  | tinyest.BinaryOperator
  | tinyest.AssignmentOperator
  | tinyest.LogicalOperator
  | tinyest.UnaryOperator;

function operatorToType<
  TL extends wgsl.BaseData | UnknownData,
  TR extends wgsl.BaseData | UnknownData,
>(lhs: TL, op: Operator, rhs?: TR): TL | TR | wgsl.Bool {
  if (!rhs) {
    if (op === '!') {
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

const unaryOpCodeToCodegen = {
  '-': neg[$gpuCallable].call.bind(neg),
  'void': () => snip(undefined, wgsl.Void, 'constant'),
} satisfies Partial<
  Record<tinyest.UnaryOperator, (...args: never[]) => unknown>
>;

const binaryOpCodeToCodegen = {
  '+': add[$gpuCallable].call.bind(add),
  '-': sub[$gpuCallable].call.bind(sub),
  '*': mul[$gpuCallable].call.bind(mul),
  '/': div[$gpuCallable].call.bind(div),
  '**': pow[$gpuCallable].call.bind(pow),
} satisfies Partial<
  Record<tinyest.BinaryOperator, (...args: never[]) => unknown>
>;

class WgslGenerator implements ShaderGenerator {
  #ctx: GenerationCtx | undefined = undefined;
  // used to detect `continue` and `break` nodes in loop body
  #unrolling = false;

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
    externalMap?: ExternalMap,
  ): string {
    this.ctx.pushBlockScope();

    if (externalMap) {
      const externals = Object.fromEntries(
        Object.entries(externalMap).map((
          [id, value],
        ) => [id, coerceToSnippet(value)]),
      );
      this.ctx.setBlockExternals(externals);
    }

    try {
      this.ctx.indent();
      const body = statements.map((statement) => this.statement(statement))
        .filter((statement) => statement.length > 0)
        .join('\n');
      this.ctx.dedent();
      return `{
${body}
${this.ctx.pre}}`;
    } finally {
      this.ctx.popBlockScope();
    }
  }

  public refVariable(
    id: string,
    dataType: wgsl.StorableData,
  ): string {
    const varName = this.ctx.makeNameValid(id);
    const ptrType = ptrFn(dataType);
    const snippet = snip(
      new RefOperator(snip(varName, dataType, 'function'), ptrType),
      ptrType,
      'function',
    );
    this.ctx.defineVariable(id, snippet);
    return varName;
  }

  public blockVariable(
    varType: 'var' | 'let' | 'const',
    id: string,
    dataType: wgsl.BaseData | UnknownData,
    origin: Origin,
  ): Snippet {
    const naturallyEphemeral = wgsl.isNaturallyEphemeral(dataType);

    let varOrigin: Origin;
    if (
      origin === 'constant-tgpu-const-ref' ||
      origin === 'runtime-tgpu-const-ref'
    ) {
      // Even types that aren't naturally referential (like vectors or structs) should
      // be treated as constant references when assigned to a const.
      varOrigin = origin;
    } else if (origin === 'argument') {
      if (naturallyEphemeral) {
        varOrigin = 'runtime';
      } else {
        varOrigin = 'argument';
      }
    } else if (!naturallyEphemeral) {
      varOrigin = isEphemeralOrigin(origin) ? 'this-function' : origin;
    } else if (origin === 'constant' && varType === 'const') {
      varOrigin = 'constant';
    } else {
      varOrigin = 'runtime';
    }

    const snippet = snip(
      this.ctx.makeNameValid(id),
      dataType,
      /* origin */ varOrigin,
    );
    this.ctx.defineVariable(id, snippet);
    return snippet;
  }

  public identifier(id: string): Snippet {
    if (!id) {
      throw new Error('Cannot resolve an empty identifier');
    }
    if (id === 'undefined') {
      return snip(undefined, wgsl.Void, 'constant');
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
    expectedType: wgsl.BaseData | wgsl.BaseData[],
  ) {
    const prevExpectedType = this.ctx.expectedType;
    this.ctx.expectedType = expectedType;

    try {
      const result = this.expression(expression);
      if (expectedType instanceof AutoStruct) {
        // We provide a certain AutoStruct object to later
        // investigate what props were accessed. No need to
        // convert the result.
        return result;
      }
      return tryConvertSnippet(this.ctx, result, expectedType);
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
      return snip(expression, bool, /* origin */ 'constant');
    }

    if (
      expression[0] === NODE.logicalExpr ||
      expression[0] === NODE.binaryExpr ||
      expression[0] === NODE.assignmentExpr
    ) {
      // Logical/Binary/Assignment Expression
      const [exprType, lhs, op, rhs] = expression;
      const lhsExpr = this.expression(lhs);
      const rhsExpr = this.expression(rhs);

      if (rhsExpr.value instanceof RefOperator) {
        throw new WgslTypeError(
          stitch`Cannot assign a ref to an existing variable '${lhsExpr}', define a new variable instead.`,
        );
      }

      if (op === '==') {
        throw new Error('Please use the === operator instead of ==');
      }

      if (
        op === '===' && isKnownAtComptime(lhsExpr) && isKnownAtComptime(rhsExpr)
      ) {
        return snip(lhsExpr.value === rhsExpr.value, bool, 'constant');
      }

      if (lhsExpr.dataType === UnknownData) {
        throw new WgslTypeError(`Left-hand side of '${op}' is of unknown type`);
      }

      if (rhsExpr.dataType === UnknownData) {
        throw new WgslTypeError(
          `Right-hand side of '${op}' is of unknown type`,
        );
      }

      const codegen =
        binaryOpCodeToCodegen[op as keyof typeof binaryOpCodeToCodegen];
      if (codegen) {
        return codegen(this.ctx, [lhsExpr, rhsExpr]);
      }

      const forcedType = exprType === NODE.assignmentExpr
        ? [lhsExpr.dataType]
        : undefined;

      const [convLhs, convRhs] =
        convertToCommonType(this.ctx, [lhsExpr, rhsExpr], forcedType) ??
          [lhsExpr, rhsExpr];

      const lhsStr = this.ctx.resolve(convLhs.value, convLhs.dataType).value;
      const rhsStr = this.ctx.resolve(convRhs.value, convRhs.dataType).value;
      const type = operatorToType(convLhs.dataType, op, convRhs.dataType);

      if (exprType === NODE.assignmentExpr) {
        if (
          convLhs.origin === 'constant' ||
          convLhs.origin === 'constant-tgpu-const-ref' ||
          convLhs.origin === 'runtime-tgpu-const-ref'
        ) {
          throw new WgslTypeError(
            `'${lhsStr} = ${rhsStr}' is invalid, because ${lhsStr} is a constant. This error may also occur when assigning to a value defined outside of a TypeGPU function's scope.`,
          );
        }

        if (lhsExpr.origin === 'argument') {
          throw new WgslTypeError(
            `'${lhsStr} ${op} ${rhsStr}' is invalid, because non-pointer arguments cannot be mutated.`,
          );
        }

        if (
          rhsExpr.origin === 'argument' &&
          !wgsl.isNaturallyEphemeral(rhsExpr.dataType)
        ) {
          throw new WgslTypeError(
            `'${lhsStr} = ${rhsStr}' is invalid, because argument references cannot be assigned.\n-----\nTry '${lhsStr} = ${
              this.ctx.resolve(rhsExpr.dataType).value
            }(${rhsStr})' to copy the value instead.\n-----`,
          );
        }

        // Compound assignment operators are okay, e.g. +=, -=, *=, /=, ...
        if (op === '=' && !isEphemeralSnippet(rhsExpr)) {
          throw new WgslTypeError(
            `'${lhsStr} = ${rhsStr}' is invalid, because references cannot be assigned.\n-----\nTry '${lhsStr} = ${
              this.ctx.resolve(rhsExpr.dataType).value
            }(${rhsStr})' to copy the value instead.\n-----`,
          );
        }
      }

      return snip(
        parenthesizedOps.includes(op)
          ? `(${lhsStr} ${OP_MAP[op] ?? op} ${rhsStr})`
          : `${lhsStr} ${OP_MAP[op] ?? op} ${rhsStr}`,
        type,
        // Result of an operation, so not a reference to anything
        /* origin */ 'runtime',
      );
    }

    if (expression[0] === NODE.postUpdate) {
      // Post-Update Expression
      const [_, op, arg] = expression;
      const argExpr = this.expression(arg);
      const argStr = this.ctx.resolve(argExpr.value, argExpr.dataType).value;

      // Result of an operation, so not a reference to anything
      return snip(`${argStr}${op}`, argExpr.dataType, /* origin */ 'runtime');
    }

    if (expression[0] === NODE.unaryExpr) {
      // Unary Expression
      const [_, op, arg] = expression;
      const argExpr = this.expression(arg);

      const codegen =
        unaryOpCodeToCodegen[op as keyof typeof unaryOpCodeToCodegen];
      if (codegen) {
        return codegen(this.ctx, [argExpr]);
      }

      const argStr = this.ctx.resolve(argExpr.value, argExpr.dataType).value;

      const type = operatorToType(argExpr.dataType, op);
      // Result of an operation, so not a reference to anything
      return snip(`${op}${argStr}`, type, /* origin */ 'runtime');
    }

    if (expression[0] === NODE.memberAccess) {
      // Member Access
      const [_, targetNode, property] = expression;
      const target = this.expression(targetNode);

      if (target.value === console) {
        return snip(
          new ConsoleLog(property),
          UnknownData,
          /* origin */ 'runtime',
        );
      }

      if (target.value === Math) {
        if (property in mathToStd && mathToStd[property]) {
          return snip(
            mathToStd[property],
            UnknownData,
            /* origin */ 'runtime',
          );
        }
        if (typeof Math[property as keyof typeof Math] === 'function') {
          throw new Error(
            `Unsupported functionality 'Math.${property}'. Use an std alternative, or implement the function manually.`,
          );
        }
      }

      const accessed = accessProp(target, property);
      if (!accessed) {
        throw new Error(
          stitch`Property '${property}' not found on value '${target}' of type ${
            this.ctx.resolve(target.dataType)
          }`,
        );
      }
      return accessed;
    }

    if (expression[0] === NODE.indexAccess) {
      // Index Access
      const [_, targetNode, propertyNode] = expression;
      const target = this.expression(targetNode);
      const inProperty = this.expression(propertyNode);
      const property = convertToCommonType(
        this.ctx,
        [inProperty],
        [u32, i32],
        /* verbose */ false,
      )?.[0] ?? inProperty;

      const accessed = accessIndex(target, property);
      if (!accessed) {
        const targetStr = this.ctx.resolve(target.value, target.dataType).value;
        const propertyStr =
          this.ctx.resolve(property.value, property.dataType).value;

        throw new Error(
          `Unable to index value ${targetStr} of unknown type with index ${propertyStr}. If the value is an array, to address this, consider one of the following approaches: (1) declare the array using 'tgpu.const', (2) store the array in a buffer, or (3) define the array within the GPU function scope.`,
        );
      }

      return accessed;
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

      if (wgsl.isWgslStruct(callee.value)) {
        // Struct schema call.
        if (argNodes.length > 1) {
          throw new WgslTypeError(
            'Struct schemas should always be called with at most 1 argument',
          );
        }

        // No arguments `Struct()`, resolve struct name and return.
        if (!argNodes[0]) {
          // The schema becomes the data type.
          return snip(
            `${this.ctx.resolve(callee.value).value}()`,
            callee.value,
            // A new struct, so not a reference.
            /* origin */ 'runtime',
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
          // A new struct, so not a reference.
          /* origin */ 'runtime',
        );
      }

      if (wgsl.isWgslArray(callee.value)) {
        // Array schema call.
        if (argNodes.length > 1) {
          throw new WgslTypeError(
            'Array schemas should always be called with at most 1 argument',
          );
        }

        // No arguments `array<...>()`, resolve array type and return.
        if (!argNodes[0]) {
          // The schema becomes the data type.
          return snip(
            `${this.ctx.resolve(callee.value).value}()`,
            callee.value,
            // A new array, so not a reference.
            /* origin */ 'runtime',
          );
        }

        const arg = this.typedExpression(
          argNodes[0],
          callee.value,
        );

        // `d.arrayOf(...)([...])`.
        // We don't resolve the ArrayExpression object itself to
        // avoid reference checks (we're copying so it's fine)
        if (arg.value instanceof ArrayExpression) {
          return snip(
            stitch`${
              this.ctx.resolve(callee.value).value
            }(${arg.value.elements})`,
            arg.dataType,
            /* origin */ 'runtime',
          );
        }

        // `d.arrayOf(...)(otherArr)`.
        // We just let the argument resolve everything.
        return snip(
          this.ctx.resolve(arg.value, callee.value).value,
          callee.value,
          // A new array, so not a reference.
          /* origin */ 'runtime',
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
        return callee.value.operator(this.ctx, [callee.value.lhs, rhs]);
      }

      if (callee.value instanceof ConsoleLog) {
        return this.ctx.generateLog(
          callee.value.op,
          argNodes.map((arg) => this.expression(arg)),
        );
      }

      if (isGPUCallable(callee.value)) {
        const callable = callee.value[$gpuCallable];
        const strictSignature = callable.strictSignature;

        let convertedArguments: Snippet[];
        if (strictSignature) {
          // The function's signature does not depend on the context, so it can be used to
          // give a hint to the argument expressions that a specific type is expected.
          convertedArguments = argNodes.map((arg, i) => {
            const argType = strictSignature.argTypes[i];
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
          convertedArguments = argNodes.map((arg) => this.expression(arg));
        }

        try {
          return callable.call(this.ctx, convertedArguments);
        } catch (err) {
          if (err instanceof ResolutionError) {
            throw err;
          }

          throw new ResolutionError(err, [{
            toString: () => `fn:${getName(callee.value)}`,
          }]);
        }
      }

      const isGeneric = isGenericFn(callee.value);
      if (!isMarkedInternal(callee.value) || isGeneric) {
        const slotPairs = isGeneric
          ? (callee.value[$providing]?.pairs ?? [])
          : [];
        const callback = isGeneric
          ? callee.value[$internal].inner
          : (callee.value as AnyFn);

        const shelllessCall = this.ctx.withRenamed(
          callback,
          getName(callee.value),
          () =>
            this.ctx.withSlots(slotPairs, (): Snippet | undefined => {
              const args = argNodes.map((arg) => this.expression(arg));
              const shellless = this.ctx.shelllessRepo.get(callback, args);
              if (!shellless) {
                return undefined;
              }

              const converted = args.map((s, idx) => {
                const argType = shellless.argTypes[idx] as wgsl.BaseData;
                return tryConvertSnippet(
                  this.ctx,
                  s,
                  argType,
                  /* verbose */ false,
                );
              });

              return this.ctx.withResetIndentLevel(() => {
                const snippet = this.ctx.resolve(shellless);
                return snip(
                  stitch`${snippet.value}(${converted})`,
                  snippet.dataType,
                  /* origin */ 'runtime',
                );
              });
            }),
        );

        if (shelllessCall) {
          return shelllessCall;
        }
      }

      throw new Error(
        `Function '${
          getName(callee.value) ?? String(callee.value)
        }' is not marked with the 'use gpu' directive and cannot be used in a shader`,
      );
    }

    if (expression[0] === NODE.objectExpr) {
      // Object Literal
      const obj = expression[1];
      const structType = this.ctx.expectedType;

      if (structType instanceof AutoStruct) {
        const entries = Object.fromEntries(
          Object.entries(obj).map(([key, value]) => {
            let accessed = structType.accessProp(key);
            let expr: Snippet;
            if (accessed) {
              // Generating the expression expecting a specific type
              expr = this.typedExpression(value, accessed.type);
            } else {
              // Generating the expression and inferring the type instead
              expr = this.expression(value);
              if (expr.dataType === UnknownData) {
                throw new WgslTypeError(
                  stitch`Property ${key} in object literal has a value of unknown type: '${expr}'`,
                );
              }
              accessed = structType.provideProp(key, concretize(expr.dataType));
            }

            return [accessed.prop, expr];
          }),
        );

        const completeStruct = structType.completeStruct;
        const convertedSnippets = convertStructValues(
          this.ctx,
          completeStruct,
          entries,
        );

        return snip(
          stitch`${this.ctx.resolve(structType).value}(${convertedSnippets})`,
          completeStruct,
          /* origin */ 'runtime',
        );
      }

      if (wgsl.isWgslStruct(structType)) {
        const entries = Object.fromEntries(
          Object.entries(structType.propTypes).map(([key, value]) => {
            const val = obj[key];
            if (val === undefined) {
              throw new WgslTypeError(
                `Missing property ${key} in object literal for struct ${structType}`,
              );
            }
            const result = this.typedExpression(val, value);
            return [key, result];
          }),
        );

        const convertedSnippets = convertStructValues(
          this.ctx,
          structType,
          entries,
        );

        return snip(
          stitch`${this.ctx.resolve(structType).value}(${convertedSnippets})`,
          structType,
          /* origin */ 'runtime',
        );
      }

      throw new WgslTypeError(
        `No target type could be inferred for object with keys [${
          Object.keys(obj).join(', ')
        }], please wrap the object in the corresponding schema.`,
      );
    }

    if (expression[0] === NODE.arrayExpr) {
      const [_, valueNodes] = expression;
      // Array Expression
      const arrType = this.ctx.expectedType;
      let elemType: wgsl.BaseData;
      let values: Snippet[];

      if (wgsl.isWgslArray(arrType)) {
        elemType = arrType.elementType;
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
          this.expression(value)
        );

        if (valuesSnippets.length === 0) {
          throw new WgslTypeError(
            'Cannot infer the type of an empty array literal.',
          );
        }

        const converted = convertToCommonType(this.ctx, valuesSnippets);
        if (!converted) {
          throw new WgslTypeError(
            'The given values cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema',
          );
        }

        values = converted;
        elemType = concretize(values[0]?.dataType as wgsl.AnyWgslData);
      }

      const arrayType = arrayOf(
        elemType as wgsl.AnyWgslData,
        values.length,
      );

      return snip(
        new ArrayExpression(
          arrayType,
          values,
        ),
        arrayType,
        /* origin */ 'runtime',
      );
    }

    if (expression[0] === NODE.conditionalExpr) {
      // ternary operator
      const [_, test, consequent, alternative] = expression;
      const testExpression = this.expression(test);
      if (isKnownAtComptime(testExpression)) {
        return testExpression.value
          ? this.expression(consequent)
          : this.expression(alternative);
      } else {
        throw new Error(
          `Ternary operator is only supported for comptime-known checks (used with '${testExpression.value}'). For runtime checks, please use 'std.select' or if/else statements.`,
        );
      }
    }

    if (expression[0] === NODE.stringLiteral) {
      return snip(expression[1], UnknownData, /* origin */ 'constant');
    }

    if (expression[0] === NODE.preUpdate) {
      throw new Error('Cannot use pre-updates in TypeGPU functions.');
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
      const id = this.identifier(statement);
      const resolved = id.value && this.ctx.resolve(id.value).value;
      // oxlint-disable-next-line typescript/no-base-to-string
      return resolved ? `${this.ctx.pre}${resolved};` : '';
    }

    if (typeof statement === 'boolean') {
      return `${this.ctx.pre}${statement ? 'true' : 'false'};`;
    }

    if (statement[0] === NODE.return) {
      const returnNode = statement[1];

      if (returnNode !== undefined) {
        const expectedReturnType = this.ctx.topFunctionReturnType;
        let returnSnippet = expectedReturnType
          ? this.typedExpression(returnNode, expectedReturnType)
          : this.expression(returnNode);

        if (returnSnippet.value instanceof RefOperator) {
          throw new WgslTypeError(
            stitch`Cannot return references, returning '${returnSnippet.value.snippet}'`,
          );
        }

        // Arguments cannot be returned from functions without copying. A simple example why is:
        // const identity = (x) => {
        //   'use gpu';
        //   return x;
        // };
        //
        // const foo = (arg: d.v3f) => {
        //   'use gpu';
        //   const marg = identity(arg);
        //   marg.x = 1; // 'marg's origin would be 'runtime', so we wouldn't be able to track this misuse.
        // };
        if (
          returnSnippet.origin === 'argument' &&
          !wgsl.isNaturallyEphemeral(returnSnippet.dataType) &&
          // Only restricting this use in non-entry functions, as the function
          // is giving up ownership of all references anyway.
          this.ctx.topFunctionScope?.functionType === 'normal'
        ) {
          throw new WgslTypeError(
            stitch`Cannot return references to arguments, returning '${returnSnippet}'. Copy the argument before returning it.`,
          );
        }

        if (
          !expectedReturnType &&
          !isEphemeralSnippet(returnSnippet) &&
          returnSnippet.origin !== 'this-function'
        ) {
          const str = this.ctx.resolve(
            returnSnippet.value,
            returnSnippet.dataType,
          ).value;
          const typeStr = this.ctx.resolve(unptr(returnSnippet.dataType)).value;
          throw new WgslTypeError(
            `'return ${str};' is invalid, cannot return references.
-----
Try 'return ${typeStr}(${str});' instead.
-----`,
          );
        }

        returnSnippet = tryConvertSnippet(
          this.ctx,
          returnSnippet,
          unptr(returnSnippet.dataType) as wgsl.AnyWgslData,
          false,
        );

        invariant(
          returnSnippet.dataType !== UnknownData,
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
      let varType: 'var' | 'let' | 'const' = 'var';
      const [stmtType, rawId, rawValue] = statement;
      const eq = rawValue !== undefined ? this.expression(rawValue) : undefined;

      if (!eq) {
        throw new Error(
          `Cannot create variable '${rawId}' without an initial value.`,
        );
      }

      const ephemeral = isEphemeralSnippet(eq);
      let dataType = eq.dataType as wgsl.BaseData;
      const naturallyEphemeral = wgsl.isNaturallyEphemeral(dataType);

      if (isLooseData(eq.dataType)) {
        throw new Error(
          `Cannot create variable '${rawId}' with loose data type.`,
        );
      }

      if (eq.value instanceof RefOperator) {
        // We're assigning a newly created `d.ref()`
        if (eq.dataType !== UnknownData) {
          throw new WgslTypeError(
            `Cannot store d.ref() in a variable if it references another value. Copy the value passed into d.ref() instead.`,
          );
        }
        const refSnippet = eq.value.snippet;
        const varName = this.refVariable(
          rawId,
          concretize(refSnippet.dataType as wgsl.BaseData) as wgsl.StorableData,
        );
        return stitch`${this.ctx.pre}var ${varName} = ${
          tryConvertSnippet(
            this.ctx,
            refSnippet,
            refSnippet.dataType as wgsl.AnyWgslData,
            false,
          )
        };`;
      }

      // Assigning a reference to a `const` variable means we store the pointer
      // of the rhs.
      if (!ephemeral) {
        // Referential
        if (stmtType === NODE.let) {
          const rhsStr = this.ctx.resolve(eq.value).value;
          const rhsTypeStr = this.ctx.resolve(unptr(eq.dataType)).value;

          throw new WgslTypeError(
            `'let ${rawId} = ${rhsStr}' is invalid, because references cannot be assigned to 'let' variable declarations.
-----
- Try 'let ${rawId} = ${rhsTypeStr}(${rhsStr})' if you need to reassign '${rawId}' later
- Try 'const ${rawId} = ${rhsStr}' if you won't reassign '${rawId}' later.
-----`,
          );
        }

        if (eq.origin === 'constant-tgpu-const-ref') {
          varType = 'const';
        } else if (eq.origin === 'runtime-tgpu-const-ref') {
          varType = 'let';
        } else {
          varType = 'let';
          if (!wgsl.isPtr(dataType)) {
            const ptrType = createPtrFromOrigin(
              eq.origin,
              concretize(dataType) as wgsl.StorableData,
            );
            invariant(
              ptrType !== undefined,
              `Creating pointer type from origin ${eq.origin}`,
            );
            dataType = ptrType;
          }

          if (!(eq.value instanceof RefOperator)) {
            // If what we're assigning is something preceded by `&`, then it's a value
            // created using `d.ref()`. Otherwise, it's an implicit pointer
            dataType = implicitFrom(dataType as wgsl.Ptr);
          }
        }
      } else {
        // Non-referential

        if (stmtType === NODE.const) {
          if (eq.origin === 'argument') {
            // Arguments cannot be mutated, so we 'let' them be (kill me)
            varType = 'let';
          } else if (naturallyEphemeral) {
            varType = eq.origin === 'constant' ? 'const' : 'let';
          }
        } else {
          // stmtType === NODE.let

          if (eq.origin === 'argument') {
            if (!naturallyEphemeral) {
              const rhsStr = this.ctx.resolve(eq.value).value;
              const rhsTypeStr = this.ctx.resolve(unptr(eq.dataType)).value;

              throw new WgslTypeError(
                `'let ${rawId} = ${rhsStr}' is invalid, because references to arguments cannot be assigned to 'let' variable declarations.
  -----
  - Try 'let ${rawId} = ${rhsTypeStr}(${rhsStr})' if you need to reassign '${rawId}' later
  - Try 'const ${rawId} = ${rhsStr}' if you won't reassign '${rawId}' later.
  -----`,
              );
            }
          }
        }
      }

      const snippet = this.blockVariable(
        varType,
        rawId,
        concretize(dataType),
        eq.origin,
      );
      return stitch`${this.ctx.pre}${varType} ${snippet.value as string} = ${
        tryConvertSnippet(this.ctx, eq, dataType, false)
      };`;
    }

    if (statement[0] === NODE.block) {
      return `${this.ctx.pre}${this.block(statement)}`;
    }

    if (statement[0] === NODE.for) {
      const [_, init, condition, update, body] = statement;
      const prevUnrollingFlag = this.#unrolling;
      this.#unrolling = false;

      try {
        this.ctx.pushBlockScope();
        const [initStatement, conditionExpr, updateStatement] = this.ctx
          .withResetIndentLevel(() => [
            init ? this.statement(init) : undefined,
            condition ? this.typedExpression(condition, bool) : undefined,
            update ? this.statement(update) : undefined,
          ]);

        const initStr = initStatement ? initStatement.slice(0, -1) : '';
        const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

        const bodyStr = this.block(blockifySingleStatement(body));
        return stitch`${this.ctx.pre}for (${initStr}; ${conditionExpr}; ${updateStr}) ${bodyStr}`;
      } finally {
        this.#unrolling = prevUnrollingFlag;
        this.ctx.popBlockScope();
      }
    }

    if (statement[0] === NODE.while) {
      const prevUnrollingFlag = this.#unrolling;
      this.#unrolling = false;
      try {
        const [_, condition, body] = statement;
        const condSnippet = this.typedExpression(condition, bool);
        const conditionStr = this.ctx.resolve(condSnippet.value).value;

        const bodyStr = this.block(blockifySingleStatement(body));
        return `${this.ctx.pre}while (${conditionStr}) ${bodyStr}`;
      } finally {
        this.#unrolling = prevUnrollingFlag;
      }
    }

    if (statement[0] === NODE.forOf) {
      const [_, loopVar, iterable, body] = statement;

      if (loopVar[0] !== NODE.const) {
        throw new WgslTypeError(
          'Only `for (const ... of ... )` loops are supported',
        );
      }

      let ctxIndent = false;
      const prevUnrollingFlag = this.#unrolling;

      try {
        this.ctx.pushBlockScope();
        const iterableExpr = this.expression(iterable);
        const shouldUnroll = iterableExpr.value instanceof UnrollableIterable;
        const iterableSnippet = shouldUnroll
          ? iterableExpr.value.snippet
          : iterableExpr;
        const elementCountSnippet = forOfUtils.getElementCountSnippet(
          this.ctx,
          iterableSnippet,
          shouldUnroll,
        );
        const originalLoopVarName = loopVar[1];
        const blockified = blockifySingleStatement(body);

        if (shouldUnroll) {
          if (!isKnownAtComptime(elementCountSnippet)) {
            throw new Error(
              'Cannot unroll loop. Length of iterable is unknown at comptime.',
            );
          }

          this.#unrolling = true;

          const length = elementCountSnippet.value as number;
          if (length === 0) {
            return '';
          }

          const { value } = iterableSnippet;

          const elements = value instanceof ArrayExpression
            ? value.elements
            : Array.from(
              { length },
              (_, i) =>
                forOfUtils.getElementSnippet(
                  iterableSnippet,
                  snip(i, u32, 'constant'),
                ),
            );

          if (
            isEphemeralSnippet(elements[0] as Snippet) &&
            !wgsl.isNaturallyEphemeral(elements[0]?.dataType)
          ) {
            throw new WgslTypeError(
              'Cannot unroll loop. The elements of iterable are emphemeral but not naturally ephemeral.',
            );
          }

          const blocks = elements
            .map((e, i) =>
              `${this.ctx.pre}// unrolled iteration #${i}, '${originalLoopVarName}' is '${stitch`${e}`}'\n${this.ctx.pre}${
                this.block(blockified, { [originalLoopVarName]: e })
              }`
            );

          return blocks.join('\n');
        }

        if (isEphemeralSnippet(iterableSnippet)) {
          throw new Error(
            `\`for ... of ...\` loops only support iterables stored in variables.
  -----
  You can wrap iterable with \`tgpu.unroll(...)\`. If iterable is known at comptime, the loop will be unrolled.
  -----`,
          );
        }

        this.#unrolling = false;

        const index = this.ctx.makeNameValid('i');
        const elementSnippet = forOfUtils.getElementSnippet(
          iterableSnippet,
          snip(index, u32, 'runtime'),
        );
        const loopVarName = this.ctx.makeNameValid(originalLoopVarName);
        const loopVarKind = forOfUtils.getLoopVarKind(elementSnippet);
        const elementType = forOfUtils.getElementType(
          elementSnippet,
          iterableSnippet,
        );

        const forHeaderStr =
          stitch`${this.ctx.pre}for (var ${index} = 0u; ${index} < ${elementCountSnippet}; ${index}++) {`;

        this.ctx.indent();
        ctxIndent = true;

        const loopVarDeclStr =
          stitch`${this.ctx.pre}${loopVarKind} ${loopVarName} = ${
            tryConvertSnippet(
              this.ctx,
              elementSnippet,
              elementType,
              false,
            )
          };`;

        const bodyStr = `${this.ctx.pre}${
          this.block(blockified, {
            [originalLoopVarName]: snip(
              loopVarName,
              elementType,
              elementSnippet.origin,
            ),
          })
        }`;

        this.ctx.dedent();
        ctxIndent = false;

        return stitch`${forHeaderStr}\n${loopVarDeclStr}\n${bodyStr}\n${this.ctx.pre}}`;
      } finally {
        if (ctxIndent) {
          this.ctx.dedent();
        }
        this.#unrolling = prevUnrollingFlag;
        this.ctx.popBlockScope();
      }
    }

    if (statement[0] === NODE.continue) {
      if (this.#unrolling) {
        throw new WgslTypeError(
          'Cannot unroll loop containing `continue`',
        );
      }
      return `${this.ctx.pre}continue;`;
    }

    if (statement[0] === NODE.break) {
      if (this.#unrolling) {
        throw new WgslTypeError(
          'Cannot unroll loop containing `break`',
        );
      }
      return `${this.ctx.pre}break;`;
    }

    const expr = this.expression(statement);
    const resolved = expr.value && this.ctx.resolve(expr.value).value;
    // oxlint-disable-next-line typescript/no-base-to-string
    return resolved ? `${this.ctx.pre}${resolved};` : '';
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

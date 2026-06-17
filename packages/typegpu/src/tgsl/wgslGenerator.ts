import * as tinyest from 'tinyest';
import { stitch } from '../core/resolve/stitch.ts';
import { arrayOf } from '../data/array.ts';
import { type AnyData, UnknownData, unptr } from '../data/dataTypes.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import { vec2u, vec3u, vec4u } from '../data/vector.ts';
import {
  fallthroughCopyOrigin,
  isAlias,
  type Origin,
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../data/snippet.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { invariant, ResolutionError, WgslTypeError } from '../errors.ts';
import { getName } from '../shared/meta.ts';
import { $gpuCallable, $internal, $providing, isMarkedInternal } from '../shared/symbols.ts';
import { safeStringify } from '../shared/stringify.ts';
import { pow } from '../std/numeric.ts';
import { add, div, mul, neg, sub } from '../std/operators.ts';
import {
  isGPUCallable,
  isKnownAtComptime,
  type BindableBufferUsage,
  type DualFn,
} from '../types.ts';
import { convertStructValues, convertToCommonType, tryConvertSnippet } from './conversion.ts';
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
import { resolveData } from '../core/resolve/resolveData.ts';
import { createPtrFromOrigin, implicitFrom, ptrFn } from '../data/ptr.ts';
import { _ref, RefOperator } from '../data/ref.ts';
import { constant } from '../core/constant/tgpuConstant.ts';
import { unroll, UnrollableIterable } from '../core/unroll/tgpuUnroll.ts';
import { isGenericFn } from '../core/function/tgpuFn.ts';
import type { AnyFn } from '../core/function/fnTypes.ts';
import { AutoStruct } from '../data/autoStruct.ts';
import { mathToStd, supportedLogOps } from './jsPolyfills.ts';
import type { ExternalMap } from '../core/resolve/externals.ts';
import * as forOfUtils from './forOfUtils.ts';
import { isTgpuRange } from '../std/range.ts';
import { stringifyNode } from '../shared/tseynit.ts';
import type {
  ConstantDefinitionOptions,
  FunctionDefinitionOptions,
  VariableDefinitionOptions,
} from './shaderGenerator_members.ts';
import { getAttributesString } from '../data/attributes.ts';
import { validSelectBranchTypes } from '../std/boolean.ts';
import { isInfixDispatch } from './infixDispatch.ts';
import type { VariableScope } from '../core/variable/tgpuVariable.ts';

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

const binaryLogicalOps = ['&&', '||', '==', '!=', '===', '!==', '<', '<=', '>', '>='];

const bitShiftOps: string[] = ['<<', '>>', '<<=', '>>='];

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
    throw new Error('The `instanceof` operator is unsupported in TypeGPU functions.');
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
  void: () => snip(undefined, wgsl.Void, 'constant'),
  '!': (ctx: GenerationCtx, [argExpr]: Snippet[]) => {
    if (argExpr === undefined) {
      throw new Error('The unary operator `!` expects 1 argument, but 0 were provided.');
    }

    if (isKnownAtComptime(argExpr)) {
      return snip(!argExpr.value, bool, 'constant');
    }

    const { value, dataType } = argExpr;
    const argStr = ctx.resolve(value, dataType).value;

    if (wgsl.isBool(dataType)) {
      return snip(`!${argStr}`, bool, 'runtime');
    }
    if (wgsl.isNumericSchema(dataType)) {
      const resultStr = `!bool(${argStr})`;
      const nanGuardedStr = // abstractFloat will be resolved as comptime known value
        dataType.type === 'f32'
          ? `(((bitcast<u32>(${argStr}) & 0x7fffffff) > 0x7f800000) || ${resultStr})`
          : dataType.type === 'f16'
            ? `(((bitcast<u32>(${argStr}) & 0x7fff) > 0x7c00) || ${resultStr})`
            : resultStr;

      return snip(nanGuardedStr, bool, 'runtime');
    }

    return snip(false, bool, 'constant');
  },
} satisfies Partial<Record<tinyest.UnaryOperator, (...args: never[]) => unknown>>;

const binaryOpCodeToCodegen = {
  '+': add[$gpuCallable].call.bind(add),
  '-': sub[$gpuCallable].call.bind(sub),
  '*': mul[$gpuCallable].call.bind(mul),
  '/': div[$gpuCallable].call.bind(div),
  '**': pow[$gpuCallable].call.bind(pow),
} satisfies Partial<Record<tinyest.BinaryOperator, (...args: never[]) => unknown>>;

const usageToVarTemplateMap: Record<VariableScope | BindableBufferUsage, string> = {
  private: 'private',
  workgroup: 'workgroup',
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

export class WgslGenerator implements ShaderGenerator {
  #ctx: GenerationCtx | undefined = undefined;
  // used to detect `continue` and `break` nodes in loop body
  #unrolling = false;

  public initGenerator(ctx: GenerationCtx) {
    this.#ctx = ctx;
  }

  protected get ctx(): GenerationCtx {
    if (!this.#ctx) {
      throw new Error(
        'WGSL Generator has not yet been initialized. Please call initialize(ctx) before using the generator.',
      );
    }
    return this.#ctx;
  }

  protected _block([_, statements]: tinyest.Block, externalMap?: ExternalMap): string {
    this.ctx.pushBlockScope();

    if (externalMap) {
      const externals = Object.fromEntries(
        Object.entries(externalMap).map(([id, value]) => [id, coerceToSnippet(value)]),
      );
      this.ctx.setBlockExternals(externals);
    }

    try {
      this.ctx.indent();
      const body = statements
        .map((statement) => this._statement(statement))
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

  protected _blockStatement(block: tinyest.Block, externalMap?: ExternalMap): string {
    return `${this.ctx.pre}${this._block(block, externalMap)}`;
  }

  public refVariable(id: string, dataType: wgsl.StorableData): string {
    const varName = this.ctx.makeUniqueIdentifier(id, 'block');
    const ptrType = ptrFn(dataType);
    const snippet = snip(
      new RefOperator(snip(varName, dataType, 'function'), ptrType),
      ptrType,
      'function',
    );
    this.ctx.defineVariable(id, snippet);
    return varName;
  }

  /**
   * Creates a variable declaration string.
   * `keyword` may be a placeholder filled in later.
   */
  protected _emitVarDecl(
    keyword: 'var' | 'let' | 'const' | `#VAR_${number}#`,
    name: string,
    _dataType: wgsl.BaseData | UnknownData,
    rhsStr: string,
  ): string {
    return `${this.ctx.pre}${keyword} ${name} = ${rhsStr};`;
  }

  protected _identifier(id: string): Snippet {
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
  protected _typedExpression(
    expression: tinyest.Expression,
    expectedType: wgsl.BaseData | wgsl.BaseData[],
  ) {
    const prevExpectedType = this.ctx.expectedType;
    this.ctx.expectedType = expectedType;

    try {
      const result = this._expression(expression);
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

  protected _expression(expression: tinyest.Expression): Snippet {
    if (typeof expression === 'string') {
      return this._identifier(expression);
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
      const lhsExpr = this._expression(lhs);

      // Short Circuit Evaluation
      if ((op === '||' || op === '&&') && isKnownAtComptime(lhsExpr)) {
        const evalRhs = op === '&&' ? lhsExpr.value : !lhsExpr.value;

        if (!evalRhs) {
          return snip(op === '||', bool, 'constant');
        }

        const rhsExpr = this._expression(rhs);

        if (rhsExpr.dataType === UnknownData) {
          throw new WgslTypeError(`Right-hand side of '${op}' is of unknown type`);
        }

        if (isKnownAtComptime(rhsExpr)) {
          return snip(!!rhsExpr.value, bool, 'constant');
        }

        // we can skip lhs
        const convRhs = tryConvertSnippet(this.ctx, rhsExpr, bool, false);
        const rhsStr = this.ctx.resolve(convRhs.value, convRhs.dataType).value;
        return snip(rhsStr, bool, 'runtime');
      }

      const rhsExpr = this._expression(rhs);

      if (rhsExpr.value instanceof RefOperator) {
        throw new WgslTypeError(
          stitch`Cannot assign a ref to an existing variable '${stringifyNode(lhs)}', define a new variable instead.`,
        );
      }

      if (op === '==') {
        throw new Error('Please use the === operator instead of ==');
      }

      if (op === '!=') {
        throw new Error('Please use the !== operator instead of !=');
      }

      if (op === '===' && isKnownAtComptime(lhsExpr) && isKnownAtComptime(rhsExpr)) {
        return snip(lhsExpr.value === rhsExpr.value, bool, 'constant');
      }

      if (op === '!==' && isKnownAtComptime(lhsExpr) && isKnownAtComptime(rhsExpr)) {
        return snip(lhsExpr.value !== rhsExpr.value, bool, 'constant');
      }

      if (
        (op === '>=' || op === '<=' || op === '>' || op === '<') &&
        isKnownAtComptime(lhsExpr) &&
        isKnownAtComptime(rhsExpr)
      ) {
        const left = lhsExpr.value;
        const right = rhsExpr.value;
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new WgslTypeError(
            `Inequality comparison '${op}' requires numeric operands, got '${typeof left}' and '${typeof right}'`,
          );
        }
        if (op === '>=') return snip(left >= right, bool, 'constant');
        if (op === '<=') return snip(left <= right, bool, 'constant');
        if (op === '>') return snip(left > right, bool, 'constant');
        return snip(left < right, bool, 'constant');
      }

      if (lhsExpr.dataType === UnknownData) {
        throw new WgslTypeError(`Left-hand side of '${op}' is of unknown type`);
      }

      if (rhsExpr.dataType === UnknownData) {
        throw new WgslTypeError(`Right-hand side of '${op}' is of unknown type`);
      }

      const codegen = binaryOpCodeToCodegen[op as keyof typeof binaryOpCodeToCodegen];
      if (codegen) {
        return codegen(this.ctx, [lhsExpr, rhsExpr]);
      }

      let convLhs: Snippet;
      let convRhs: Snippet;

      if (bitShiftOps.includes(op)) {
        // rhs must be u32 (or vecN<u32> for vector lhs)
        let rhsTarget: wgsl.BaseData;
        if (wgsl.isVec(lhsExpr.dataType)) {
          const cc = lhsExpr.dataType.componentCount;
          rhsTarget = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
        } else {
          rhsTarget = u32;
        }
        convRhs = tryConvertSnippet(this.ctx, rhsExpr, rhsTarget, false);
        // if lhs is not an integer type, the browser will return a descriptive wgsl error
        convLhs = lhsExpr;
      } else {
        const forcedType = exprType === NODE.assignmentExpr ? [lhsExpr.dataType] : undefined;
        [convLhs, convRhs] = convertToCommonType(this.ctx, [lhsExpr, rhsExpr], forcedType) ?? [
          lhsExpr,
          rhsExpr,
        ];
      }

      const lhsStr = this.ctx.resolve(convLhs.value, convLhs.dataType).value;
      const rhsStr = this.ctx.resolve(convRhs.value, convRhs.dataType).value;
      const type = operatorToType(convLhs.dataType, op, convRhs.dataType);

      if (exprType === NODE.assignmentExpr) {
        validateSnippetMutation(convLhs, expression);
        this.tryMarkModified(lhs);
        // Compound assignment operators are okay, e.g. +=, -=, *=, /=, ...
        if (op === '=' && isAlias(rhsExpr) && !wgsl.isNaturallyEphemeral(rhsExpr.dataType)) {
          throw new WgslTypeError(
            `'${stringifyNode(expression)}' is invalid, because references cannot be assigned.\n-----\nTry '${stringifyNode(lhs)} = ${
              this.ctx.resolve(rhsExpr.dataType).value
            }(${stringifyNode(rhs)})' to copy the value instead.\n-----`,
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
      throw new Error(
        `'${stringifyNode(expression)}' is invalid because update is only allowed as a statement.`,
      );
    }

    if (expression[0] === NODE.unaryExpr) {
      // Unary Expression
      const [_, op, arg] = expression;
      const argExpr = this._expression(arg);

      const codegen = unaryOpCodeToCodegen[op as keyof typeof unaryOpCodeToCodegen];
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
      const target = this._expression(targetNode);

      const accessed = accessProp(target, property);
      if (!accessed) {
        throw new Error(`Property '${property}' not found on '${stringifyNode(targetNode)}'`);
      }
      return accessed;
    }

    if (expression[0] === NODE.indexAccess) {
      // Index Access
      const [_, targetNode, propertyNode] = expression;
      const target = this._expression(targetNode);
      const inProperty = this._expression(propertyNode);
      const property =
        convertToCommonType(this.ctx, [inProperty], [u32, i32], /* verbose */ false)?.[0] ??
        inProperty;

      const accessed = accessIndex(target, property);
      if (!accessed) {
        throw new Error(
          `Index access '${stringifyNode(expression)}' is invalid. If the value is an array, to address this, consider one of the following approaches: (1) declare the array using 'tgpu.const', (2) store the array in a buffer, or (3) define the array within the GPU function scope.`,
        );
      }

      return accessed;
    }

    if (expression[0] === NODE.numericLiteral) {
      // Numeric Literal
      const type =
        typeof expression[1] === 'string'
          ? numericLiteralToSnippet(parseNumericString(expression[1]))
          : numericLiteralToSnippet(expression[1]);
      invariant(type, `Expected ${stringifyNode(expression)} to be valid numeric literal`);
      return type;
    }

    if (expression[0] === NODE.call) {
      // Function Call
      const [_, calleeNode, argNodes] = expression;
      const _callee = this._expression(calleeNode);
      const callee = mathToStd.has(_callee.value as AnyFn)
        ? snip(mathToStd.get(_callee.value as AnyFn) as DualFn<AnyFn>, UnknownData, 'runtime')
        : _callee;

      if (supportedLogOps().includes(callee.value as AnyFn)) {
        return this.ctx.generateLog(
          callee.value as AnyFn,
          argNodes.map((arg) => this._expression(arg)),
        );
      }

      if (wgsl.isWgslStruct(callee.value)) {
        // Struct schema call.
        if (argNodes.length > 1) {
          throw new WgslTypeError('Struct schemas should always be called with at most 1 argument');
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

        const arg = this._typedExpression(argNodes[0], callee.value);

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
          throw new WgslTypeError('Array schemas should always be called with at most 1 argument');
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

        const arg = this._typedExpression(argNodes[0], callee.value);

        // `d.arrayOf(...)([...])`.
        // We don't resolve the ArrayExpression object itself to
        // avoid reference checks (we're copying so it's fine)
        if (arg.value instanceof ArrayExpression) {
          return snip(
            stitch`${this.ctx.resolve(callee.value).value}(${arg.value.elements})`,
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

      if (isInfixDispatch(callee.value)) {
        if (!argNodes[0]) {
          throw new WgslTypeError(
            `An infix operator '${getName(callee.value.operator)}' was called without any arguments`,
          );
        }
        const lhs = coerceToSnippet(callee.value.lhs);
        const rhs = this._expression(argNodes[0]);
        const callable = callee.value.operator[$gpuCallable];
        return callable.call(this.ctx, [lhs, rhs]);
      }

      if ((callee.value === _ref || callee.value === unroll) && argNodes[0]) {
        this.tryMarkModified(argNodes[0]);
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
                `Call '${stringifyNode(expression)}' is invalid since the function expected fewer arguments`,
              );
            }
            return this._typedExpression(arg, argType);
          });
        } else {
          convertedArguments = argNodes.map((arg) => this._expression(arg));
        }

        try {
          return callable.call(this.ctx, convertedArguments);
        } catch (err) {
          if (err instanceof ResolutionError) {
            throw err;
          }

          throw new ResolutionError(err, [
            {
              toString: () => `fn:${getName(callee.value)}`,
            },
          ]);
        }
      }

      const isGeneric = isGenericFn(callee.value);
      if (!isMarkedInternal(callee.value) || isGeneric) {
        const slotPairs = isGeneric ? (callee.value[$providing]?.pairs ?? []) : [];
        const callback = isGeneric ? callee.value[$internal].inner : (callee.value as AnyFn);

        const shelllessCall = this.ctx.withRenamed(callback, getName(callee.value), () =>
          this.ctx.withSlots(slotPairs, (): Snippet | undefined => {
            const args = argNodes.map((arg) => this._expression(arg));
            const shellless = this.ctx.shelllessRepo.get(callback, args);
            if (!shellless) {
              return undefined;
            }

            const converted = args.map((s, idx) => {
              const argType = shellless.argTypes[idx] as wgsl.BaseData;
              return tryConvertSnippet(this.ctx, s, argType, /* verbose */ false);
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

      // try to throw a descriptive error
      const maybeMathMethod = Object.getOwnPropertyNames(Math).find(
        (prop) => Math[prop as keyof typeof Math] === callee.value,
      );
      if (maybeMathMethod) {
        throw new Error(
          `Unsupported Math functionality 'Math.${maybeMathMethod}()'. Use an std alternative, or implement the function manually.`,
        );
      }

      const maybeConsoleMethod = Object.getOwnPropertyNames(console).find(
        (prop) => console[prop as keyof typeof console] === callee.value,
      );
      if (maybeConsoleMethod) {
        throw new Error(`Unsupported console functionality 'console.${maybeConsoleMethod}()'.`);
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
              expr = this._typedExpression(value, accessed.type);
            } else {
              // Generating the expression and inferring the type instead
              expr = this._expression(value);
              if (expr.dataType === UnknownData) {
                throw new WgslTypeError(
                  stitch`Property ${key} in object literal has a value of unknown type: '${expr}'`,
                );
              }
              // Taking care of abstract numerics and implicit pointers
              accessed = structType.provideProp(key, unptr(concretize(expr.dataType)));
            }

            return [accessed.prop, expr];
          }),
        );

        const completeStruct = structType.completeStruct;
        const convertedSnippets = convertStructValues(this.ctx, completeStruct, entries);

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
            const result = this._typedExpression(val, value);
            return [key, result];
          }),
        );

        const convertedSnippets = convertStructValues(this.ctx, structType, entries);

        return snip(
          stitch`${this.ctx.resolve(structType).value}(${convertedSnippets})`,
          structType,
          /* origin */ 'runtime',
        );
      }

      throw new WgslTypeError(
        `No target type could be inferred for object '${stringifyNode(expression)}', please wrap the object in the corresponding schema.`,
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
        values = valueNodes.map((value) => this._typedExpression(value, elemType));
        // Since it's an expected type, we enforce the length
        if (values.length !== arrType.elementCount) {
          throw new WgslTypeError(
            `Cannot create value of type '${arrType}' from an array of length: ${values.length}`,
          );
        }
      } else {
        // The array is not typed, so we try to guess the types.
        const valuesSnippets = valueNodes.map((value) => this._expression(value));

        if (valuesSnippets.length === 0) {
          throw new WgslTypeError('Cannot infer the type of an empty array literal.');
        }

        const converted = convertToCommonType(this.ctx, valuesSnippets);
        if (!converted) {
          throw new WgslTypeError(
            `Values '${stringifyNode(expression)}' cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema`,
          );
        }

        values = converted;
        elemType = concretize(values[0]?.dataType as wgsl.AnyWgslData);
      }

      const arrayType = arrayOf(elemType as wgsl.AnyWgslData, values.length);

      return snip(new ArrayExpression(arrayType, values), arrayType, /* origin */ 'runtime');
    }

    if (expression[0] === NODE.conditionalExpr) {
      // ternary operator
      const [_, testNode, consequentNode, alternativeNode] = expression;
      const test = this._expression(testNode);

      if (isKnownAtComptime(test)) {
        return test.value ? this._expression(consequentNode) : this._expression(alternativeNode);
      } else {
        const consequent = this._expression(consequentNode);
        const alternative = this._expression(alternativeNode);
        const [con, alt] =
          convertToCommonType(this.ctx, [consequent, alternative], validSelectBranchTypes) ?? [];

        if (!con || !alt || consequent.possibleSideEffects || alternative.possibleSideEffects) {
          throw new Error(
            `Ternary operator '${stringifyNode(expression)}' is invalid. For more complex branching, please use 'std.select' or if/else statements.`,
          );
        }

        return snip(
          stitch`select(${alt}, ${con}, ${test})`,
          con.dataType,
          'runtime',
          // this select has side-effects only if the condition has side-effects
          test.possibleSideEffects,
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

  public declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet {
    const resolvedDataType = this.ctx.resolve(options.dataType).value;
    const resolvedValue = this.ctx.resolveSnippet(options.init).value;

    this.ctx.addDeclaration(`const ${options.id}: ${resolvedDataType} = ${resolvedValue};`);

    return snip(options.id, options.dataType, 'constant-immutable-def');
  }

  public declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet {
    let pre = '';

    if (options.group !== undefined) {
      pre += `@group(${options.group}) `;
    }

    if (options.binding !== undefined) {
      pre += `@binding(${options.binding}) `;
    }

    if (options.scope in usageToVarTemplateMap) {
      pre += `var<${usageToVarTemplateMap[options.scope as keyof typeof usageToVarTemplateMap]}> `;
    } else {
      pre += `var `;
    }

    pre += `${options.id}: ${this.ctx.resolve(options.dataType).value}`;

    this.ctx.addDeclaration(
      options.init ? `${pre} = ${this.ctx.resolveSnippet(options.init).value};` : `${pre};`,
    );

    return snip(options.id, options.dataType, options.scope);
  }

  public functionDefinition(options: FunctionDefinitionOptions): string {
    // Function body
    let body = this._block(options.body);
    const scope = this.ctx.topFunctionScope;
    invariant(scope, 'Expected function scope to be present');
    const replacements = Object.fromEntries(
      [...scope.placeholderForVariable.entries()].map(([variable, placeholder]) => [
        placeholder,
        scope.modifiedVariables.has(variable) ? 'var' : 'let',
      ]),
    );
    if (Object.keys(replacements).length > 0) {
      const regex = new RegExp(Object.keys(replacements).join('|'), 'gi');
      body = body.replace(
        regex,
        (match) => replacements[match as keyof typeof replacements] ?? '#ERR',
      );
    }

    // Only after generating the body can we determine the return type
    const returnType = options.determineReturnType();

    const argList = options.args
      // Stripping out unused arguments in entry functions
      .filter((arg) => arg.used || options.functionType === 'normal')
      .map((arg) => {
        return `${getAttributesString(arg.decoratedType)}${arg.name}: ${this.ctx.resolve(arg.decoratedType).value}`;
      })
      .join(', ');

    const head =
      returnType.type !== 'void'
        ? `(${argList}) -> ${getAttributesString(returnType)}${this.ctx.resolve(returnType).value} `
        : `(${argList}) `;

    let attributes = '';
    if (options.functionType === 'compute') {
      if (!options.workgroupSize) {
        throw new Error('Compute shaders must have a workgroup size');
      }
      attributes = `@compute @workgroup_size(${options.workgroupSize.join(', ')}) `;
    } else if (options.functionType === 'vertex') {
      attributes = `@vertex `;
    } else if (options.functionType === 'fragment') {
      attributes = `@fragment `;
    }

    return `${attributes}fn ${options.name}${head}${body}`;
  }

  /**
   * Generates a WGSL type string for the given data type, and adds necessary
   * definitions to the shader preamble. This shouldn't be called directly, only
   * through `ctx.resolve` to properly cache the result.
   */
  public typeAnnotation(data: wgsl.BaseData): string {
    return resolveData(this.ctx, data as AnyData);
  }

  public typeInstantiation(schema: wgsl.BaseData, args: readonly Snippet[]): ResolvedSnippet {
    if (args.length === 1 && args[0]?.dataType === schema) {
      // Already of the desired type, e.g. `bool(false)` or `vec3f(vec3f(1, 2, 3))`
      // We can make this snippet ephemeral, as we know it will be deep copied in JS
      return snip(stitch`${args[0]}`, schema, fallthroughCopyOrigin(args[0].origin));
    }
    // Creating a 'runtime' snippet, since it's instantiating a new value
    return snip(stitch`${this.ctx.resolve(schema).value}(${args})`, schema, 'runtime');
  }

  public numericLiteral(value: number, schema: wgsl.BaseData): ResolvedSnippet {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Value '${value}' (${schema.type}) cannot be resolved due to WGSL's Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption). This value might be a result of a comptime-evaluated operation.`,
      );
    }

    if (schema.type === 'abstractInt') {
      return snip(`${value}`, schema, /* origin */ 'constant');
    }
    if (schema.type === 'u32') {
      return snip(`${value}u`, schema, /* origin */ 'constant');
    }
    if (schema.type === 'i32') {
      return snip(`${value}i`, schema, /* origin */ 'constant');
    }

    const exp = value.toExponential();
    const decimal =
      schema.type === 'abstractFloat' && Number.isInteger(value) ? `${value}.` : `${value}`;

    // Just picking the shorter one
    const base = exp.length < decimal.length ? exp : decimal;
    if (schema.type === 'f32') {
      return snip(`${base}f`, schema, /* origin */ 'constant');
    }
    if (schema.type === 'f16') {
      return snip(`${base}h`, schema, /* origin */ 'constant');
    }
    return snip(base, schema, /* origin */ 'constant');
  }

  protected _return(statement: tinyest.Return): string {
    const returnNode = statement[1];

    if (returnNode !== undefined) {
      const expectedReturnType = this.ctx.topFunctionReturnType;
      let returnSnippet = expectedReturnType
        ? this._typedExpression(returnNode, expectedReturnType)
        : this._expression(returnNode);

      if (returnSnippet.value instanceof RefOperator) {
        throw new WgslTypeError(
          `Cannot return '${stringifyNode(returnNode)}' because it is a d.ref`,
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
          `'${stringifyNode(statement)}' is invalid, cannot return references to arguments. Copy the argument before returning it.`,
        );
      }

      if (
        // The existence of `expectedReturnType` implies a function shell, which in turn implies that the
        // value will be copied on return anyway
        !expectedReturnType &&
        isAlias(returnSnippet) &&
        !wgsl.isNaturallyEphemeral(returnSnippet.dataType) &&
        returnSnippet.origin !== 'local-def'
      ) {
        const str = stringifyNode(returnNode);
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

      invariant(returnSnippet.dataType !== UnknownData, 'Return type should be known');

      this.ctx.reportReturnType(returnSnippet.dataType);
      return stitch`${this.ctx.pre}return ${returnSnippet};`;
    }

    return `${this.ctx.pre}return;`;
  }

  protected _letStatement(statement: tinyest.Let): string {
    const [_, rawId, eqNode] = statement;

    if (eqNode === undefined) {
      throw new Error(
        `'${stringifyNode(statement)}' is invalid because all variables need initializers.`,
      );
    }

    const eq = this._expression(eqNode);

    if (eq.value instanceof RefOperator) {
      const rhsStr = stringifyNode(eqNode);
      throw new WgslTypeError(
        `'let ${rawId} = ${rhsStr}' is invalid, cannot initialize 'let' variables with d.ref()
-----
- Try 'const ${rawId} = ${rhsStr}'.
-----`,
      );
    }

    const definitionDataType = eq.dataType;

    if (definitionDataType === UnknownData) {
      const rhsStr = stringifyNode(eqNode);
      throw new WgslTypeError(
        `'let ${rawId} = ${rhsStr}' is invalid, cannot determine WGSL type of '${rhsStr}'
-----
- Try using or defining a schema that matches your desired value the most, and wrap the value with it: 'let ${rawId} = Schema(${rhsStr})'
-----`,
      );
    }

    if (isAlias(eq) && !wgsl.isNaturallyEphemeral(eq.dataType)) {
      // `let` declarations cannot store references
      const rhsStr = stringifyNode(eqNode);
      const rhsTypeStr = this.ctx.resolve(unptr(eq.dataType)).value;

      throw new WgslTypeError(
        `'let ${rawId} = ${rhsStr}' is invalid, because references cannot be assigned to 'let' variable declarations.
-----
- Try 'let ${rawId} = ${rhsTypeStr}(${rhsStr})' if you need to reassign '${rawId}' later
- Try 'const ${rawId} = ${rhsStr}' if you won't reassign '${rawId}' later.
-----`,
      );
    }

    const concreteType = concretize(definitionDataType);
    const snippet = snip(
      this.ctx.makeUniqueIdentifier(rawId, 'block'),
      concreteType,
      /* origin */ 'local-def',
      // Accessing variable declarations is side-effect free.
      /* possibleSideEffects */ false,
    );
    this.ctx.defineVariable(rawId, snippet);

    const rhsSnippet = tryConvertSnippet(this.ctx, eq, definitionDataType, false);
    const rhsStr = this.ctx.resolve(rhsSnippet.value, rhsSnippet.dataType).value;

    // Even though the user defined a 'let' (expecting it to be reassigned), the
    // reassignment might happen in a pruned branch, in which case we can generate
    // more optimised code by emitting 'let' or 'const' instead of 'var'.
    const scope = this.ctx.topFunctionScope;
    invariant(scope, `Expected function scope to be present for ${rawId}`);
    const emittedVarType = `#VAR_${scope.placeholderForVariable.size}#` as const;
    scope.placeholderForVariable.set(snippet, emittedVarType);

    return this._emitVarDecl(emittedVarType, snippet.value, concreteType, rhsStr);
  }

  protected _constStatement(statement: tinyest.Const) {
    const [_, rawId, eqNode] = statement;

    if (eqNode === undefined) {
      throw new Error(
        `'${stringifyNode(statement)}' is invalid because all variables need initializers.`,
      );
    }

    const eq = this._expression(eqNode);

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
      return stitch`${this.ctx.pre}var ${varName} = ${tryConvertSnippet(
        this.ctx,
        refSnippet,
        refSnippet.dataType as wgsl.AnyWgslData,
        false,
      )};`;
    }

    const rhsNaturallyEphemeral = wgsl.isNaturallyEphemeral(eq.dataType);
    let varOrigin: Origin = 'local-def';
    let varType: 'var' | 'let' | 'const' | '<deferred>' = '<deferred>';
    let definitionDataType = eq.dataType;

    if (definitionDataType === UnknownData) {
      const rhsStr = stringifyNode(eqNode);
      throw new WgslTypeError(
        `'const ${rawId} = ${rhsStr}' is invalid, cannot determine WGSL type of '${rhsStr}'
-----
- Try using or defining a schema that matches your desired value the most, and wrap the value with it: 'const ${rawId} = Schema(${rhsStr})'
-----`,
      );
    }

    if (eq.origin === 'argument') {
      // Arguments are immutable, so we 'let' them be (kill me)
      varType = 'let';
      // When we declare a new variable with a naturally ephemeral value (e.g. a scalar)
      // the variable now loses the restrictions of an argument, and becomes just a regular
      // variable. For vectors and other non-naturally ephemeral values, the restrictions of
      // arguments are kept.
      varOrigin = rhsNaturallyEphemeral ? 'local-def' : 'argument';
    } else if (eq.origin === 'constant-immutable-def') {
      varType = 'const';
      varOrigin = 'constant-immutable-def';
    } else if (eq.origin === 'runtime-immutable-def') {
      varType = 'let';
      varOrigin = 'runtime-immutable-def';
    } else if (rhsNaturallyEphemeral) {
      varType = eq.origin === 'constant' ? 'const' : 'let';
      // Constants are also local declarations. We lose some information here, meaning
      // when we look at a variable's snippet, we cannot tell if it's a constant or not.
      // This is mostly because we plan to determine this fact later, after all of the
      // function code has been processed, so at least currently, we lose that info.
      varOrigin = 'local-def';
    } else if (!isAlias(eq)) {
      // Not a reference, but also not naturally ephemeral, so we cannot guarantee it won't be mutated.
      // We defer the decision for now.
      varType = '<deferred>';
      varOrigin = 'local-def';
    } else {
      // Assigning a reference to a `const` variable means we store the pointer
      // of the rhs.
      varType = 'let';
      varOrigin = eq.origin; // we pass on the origin
      if (!wgsl.isPtr(eq.dataType)) {
        const ptrType = createPtrFromOrigin(
          eq.origin,
          concretize(eq.dataType as wgsl.BaseData) as wgsl.StorableData,
        );
        invariant(ptrType !== undefined, `Creating pointer type from origin ${eq.origin}`);
        definitionDataType = ptrType;
      }

      // Making the pointer implicit, meaning the fact it's a pointer isn't
      // reflected in the JS source code.
      definitionDataType = implicitFrom(definitionDataType as wgsl.Ptr);
      this.tryMarkModified(eqNode);
    }

    const concreteType = concretize(definitionDataType);
    const snippet = snip(
      this.ctx.makeUniqueIdentifier(rawId, 'block'),
      concreteType,
      /* origin */ varOrigin,
      // Accessing variable declarations is side-effect free.
      /* possibleSideEffects */ false,
    );
    this.ctx.defineVariable(rawId, snippet);

    const rhsSnippet = tryConvertSnippet(this.ctx, eq, definitionDataType, false);
    const rhsStr = this.ctx.resolve(rhsSnippet.value, rhsSnippet.dataType).value;

    let emittedVarType: 'var' | 'let' | 'const' | `#VAR_${number}#`;
    if (varType === '<deferred>') {
      const scope = this.ctx.topFunctionScope;
      invariant(scope, `Expected function scope to be present for ${rawId}`);
      emittedVarType = `#VAR_${scope.placeholderForVariable.size}#`;
      scope.placeholderForVariable.set(snippet, emittedVarType);
    } else {
      emittedVarType = varType;
    }

    return this._emitVarDecl(emittedVarType, snippet.value, concreteType, rhsStr);
  }

  protected _statement(statement: tinyest.Statement): string {
    if (typeof statement === 'string') {
      const id = this._identifier(statement);
      const resolved = id.value && this.ctx.resolve(id.value).value;
      // oxlint-disable-next-line typescript/no-base-to-string
      return resolved ? `${this.ctx.pre}${resolved};` : '';
    }

    if (typeof statement === 'boolean') {
      return `${this.ctx.pre}${statement ? 'true' : 'false'};`;
    }

    if (statement[0] === NODE.return) {
      return this._return(statement);
    }

    if (statement[0] === NODE.if) {
      const [_, condNode, consNode, altNode] = statement;
      const condition = this._typedExpression(condNode, bool);

      if (typeof condition.value === 'boolean') {
        // the condition is known at comptime
        let node = condition.value ? consNode : altNode;
        if (node === undefined) {
          return '';
        }
        if (!Array.isArray(node)) {
          node = blockifySingleStatement(node);
        }
        if (node[0] === NODE.block && node[1].length === 1 && node[1][0][0] === NODE.if) {
          // simplify 'if (true) { if (A) {B} } else {C}' to 'if (A) {B}'
          return this._statement(node[1][0]);
        }
        if (node[0] === NODE.if) {
          // simplify 'if (false) {A} else if (B) {C}' to 'if (B) {C}'
          return this._statement(node);
        }
        // simplify 'if (true) {A} else {B}' to '{A}'
        return this._blockStatement(blockifySingleStatement(node));
      }

      const consequent = this._block(blockifySingleStatement(consNode));
      const alternate = !altNode ? undefined : this._block(blockifySingleStatement(altNode));

      if (!alternate) {
        return stitch`${this.ctx.pre}if (${condition}) ${consequent}`;
      }

      return stitch`\
${this.ctx.pre}if (${condition}) ${consequent}
${this.ctx.pre}else ${alternate}`;
    }

    if (statement[0] === NODE.let) {
      return this._letStatement(statement);
    }

    if (statement[0] === NODE.const) {
      return this._constStatement(statement);
    }

    if (statement[0] === NODE.block) {
      return this._blockStatement(statement);
    }

    if (statement[0] === NODE.for) {
      const [_, init, condition, update, body] = statement;
      const prevUnrollingFlag = this.#unrolling;
      this.#unrolling = false;

      try {
        this.ctx.pushBlockScope();
        const [initStatement, conditionExpr, updateStatement] = this.ctx.withResetIndentLevel(
          () => [
            init ? this._statement(init) : undefined,
            condition ? this._typedExpression(condition, bool) : undefined,
            update ? this._statement(update) : undefined,
          ],
        );

        const initStr = initStatement ? initStatement.slice(0, -1) : '';
        const updateStr = updateStatement ? updateStatement.slice(0, -1) : '';

        const bodyStr = this._block(blockifySingleStatement(body));
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
        const condSnippet = this._typedExpression(condition, bool);
        const conditionStr = this.ctx.resolve(condSnippet.value).value;

        const bodyStr = this._block(blockifySingleStatement(body));
        return `${this.ctx.pre}while (${conditionStr}) ${bodyStr}`;
      } finally {
        this.#unrolling = prevUnrollingFlag;
      }
    }

    if (statement[0] === NODE.forOf) {
      const [_, loopVar, iterable, body] = statement;

      if (loopVar[0] !== NODE.const) {
        throw new WgslTypeError('Only `for (const ... of ... )` loops are supported');
      }

      this.tryMarkModified(iterable); // overly-defensive, but let's not tempt fate

      let ctxIndent = false;
      const prevUnrollingFlag = this.#unrolling;

      try {
        this.ctx.pushBlockScope();
        const iterableExpr = this._expression(iterable);
        const shouldUnroll = iterableExpr.value instanceof UnrollableIterable;
        const iterableSnippet = shouldUnroll ? iterableExpr.value.snippet : iterableExpr;
        const range = forOfUtils.getRangeSnippets(this.ctx, iterableSnippet, shouldUnroll);
        const originalLoopVarName = loopVar[1];
        const blockified = blockifySingleStatement(body);

        if (shouldUnroll) {
          if (!isKnownAtComptime(range.end)) {
            throw new Error('Cannot unroll loop. Length of iterable is unknown at comptime.');
          }

          this.#unrolling = true;

          const length = range.end.value as number;
          if (length === 0) {
            return '';
          }

          const { value } = iterableSnippet;

          const elements = isTgpuRange(value)
            ? value.map((i) => coerceToSnippet(i))
            : value instanceof ArrayExpression
              ? value.elements
              : Array.from({ length }, (_, i) =>
                  forOfUtils.getElementSnippet(iterableSnippet, snip(i, u32, 'constant')),
                );

          const firstElement = elements[0] as Snippet;
          if (!isAlias(firstElement) && !wgsl.isNaturallyEphemeral(firstElement.dataType)) {
            throw new WgslTypeError(
              `Cannot unroll '${stringifyNode(iterable)}'. The elements of iterable are constructed in place but are not value types.`,
            );
          }

          const blocks = elements.map(
            (e, i) =>
              `${this.ctx.pre}// unrolled iteration #${i}\n${this._blockStatement(blockified, {
                [originalLoopVarName]: e,
              })}`,
          );

          return blocks.join('\n');
        }

        this.#unrolling = false;

        const index = this.ctx.makeUniqueIdentifier('i', 'block');

        const forHeaderStr = stitch`${this.ctx.pre}for (var ${index} = ${range.start}; ${index} ${range.comparison} ${range.end}; ${index} += ${range.step})`;

        let bodyStr = '';

        if (isTgpuRange(iterableSnippet.value)) {
          bodyStr = this._block(blockified, {
            [originalLoopVarName]: snip(index, range.start.dataType, 'runtime'), // range.start, .end , .step have the same dataType
          });
        } else {
          this.ctx.indent();
          ctxIndent = true;
          const loopVarName = this.ctx.makeUniqueIdentifier(originalLoopVarName, 'block');
          const elementSnippet = forOfUtils.getElementSnippet(
            iterableSnippet,
            snip(index, u32, 'runtime'),
          );
          const loopVarKind = forOfUtils.getLoopVarKind(elementSnippet);
          const elementType = forOfUtils.getElementType(elementSnippet, iterableSnippet);
          const loopVarDeclStr = stitch`${this.ctx.pre}${loopVarKind} ${loopVarName} = ${tryConvertSnippet(
            this.ctx,
            elementSnippet,
            elementType,
            false,
          )};`;

          bodyStr = `{\n${loopVarDeclStr}\n${this._blockStatement(blockified, {
            [originalLoopVarName]: snip(loopVarName, elementType, elementSnippet.origin),
          })}\n`;
          this.ctx.dedent();
          bodyStr += `${this.ctx.pre}}`;
          ctxIndent = false;
        }

        return stitch`${forHeaderStr} ${bodyStr.trim()}`;
      } finally {
        if (ctxIndent) {
          this.ctx.dedent();
        }
        this.#unrolling = prevUnrollingFlag;
        this.ctx.popBlockScope();
      }
    }

    if (statement[0] === NODE.postUpdate) {
      // Post-update statement
      const [_, op, arg] = statement;
      const argExpr = this._expression(arg);
      const argStr = this.ctx.resolve(argExpr.value, argExpr.dataType).value;

      validateSnippetMutation(argExpr, statement);
      this.tryMarkModified(arg);

      return `${this.ctx.pre}${argStr}${op};`;
    }

    if (statement[0] === NODE.continue) {
      if (this.#unrolling) {
        throw new WgslTypeError('Cannot unroll loop containing `continue`');
      }
      return `${this.ctx.pre}continue;`;
    }

    if (statement[0] === NODE.break) {
      if (this.#unrolling) {
        throw new WgslTypeError('Cannot unroll loop containing `break`');
      }
      return `${this.ctx.pre}break;`;
    }

    const expr = this._expression(statement);
    const resolved = expr.value && this.ctx.resolve(expr.value).value;
    // oxlint-disable-next-line typescript/no-base-to-string
    return resolved ? `${this.ctx.pre}${resolved};` : '';
  }

  /**
   * Attempts a member access lookup to mark a variable as modified.
   * @example
   * // given `let a; a = 1;`
   * tryMarkModified('a') // `a` is marked in the function scope
   *
   * // given `const obj; obj.prop = 1;`
   * tryMarkModified('obj.prop') // `obj` is marked in the function scope
   *
   * // given `this.buffer.$;`
   * tryMarkModified('this.buffer.$') // `this` is not marked, since there is no placeholder for it
   */
  private tryMarkModified(expr?: tinyest.Expression) {
    if (!expr) {
      return;
    }
    const maybeObject = extractObject(expr);
    if (maybeObject !== undefined) {
      const snippet = this.ctx.getById(maybeObject);
      const scope = this.ctx.topFunctionScope;
      if (snippet && scope && scope.placeholderForVariable.has(snippet)) {
        scope.modifiedVariables.add(snippet);
      }
    }
  }
}

function validateSnippetMutation(mutated: Snippet, expr: tinyest.AnyNode) {
  if (
    mutated.origin === 'constant' ||
    mutated.origin === 'constant-immutable-def' ||
    mutated.origin === 'runtime-immutable-def'
  ) {
    if (isKnownAtComptime(mutated)) {
      throw new WgslTypeError(
        `'${stringifyNode(expr)}' is invalid, because the left side is defined outside of the shader, and therefore is immutable during its execution. Try using tgpu.privateVar or buffers.`,
      );
    }
    throw new WgslTypeError(
      `'${stringifyNode(expr)}' is invalid, because the left side is a constant.`,
    );
  }

  if (mutated.origin === 'uniform') {
    throw new WgslTypeError(
      `'${stringifyNode(expr)}' is invalid, because uniform buffers cannot be mutated.`,
    );
  }

  if (mutated.origin === 'readonly') {
    throw new WgslTypeError(
      `'${stringifyNode(expr)}' is invalid, because readonly buffers cannot be mutated.`,
    );
  }

  if (mutated.origin === 'argument') {
    throw new WgslTypeError(
      `'${stringifyNode(expr)}' is invalid, because non-pointer arguments cannot be mutated.`,
    );
  }
}

function assertExhaustive(value: never): never {
  throw new Error(`'${safeStringify(value)}' was not handled by the WGSL generator.`);
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
  return typeof statement !== 'object' || statement[0] !== NODE.block
    ? [NODE.block, [statement]]
    : statement;
}

function extractObject(expr: tinyest.Expression): string | undefined {
  let object = expr;
  while (
    Array.isArray(object) &&
    (object[0] === NODE.memberAccess || object[0] === NODE.indexAccess)
  ) {
    object = object[1];
  }
  if (typeof object === 'string') {
    return object;
  }
}

const wgslGenerator: WgslGenerator = new WgslGenerator();
export default wgslGenerator;

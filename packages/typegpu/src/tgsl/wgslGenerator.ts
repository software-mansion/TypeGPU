import * as tinyest from 'tinyest';
import { stitch } from '../core/resolve/stitch.ts';
import { arrayOf } from '../data/array.ts';
import {
  type AnyData,
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
  isSnippet,
  type Origin,
  snip,
  type Snippet,
} from '../data/snippet.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { invariant, ResolutionError, WgslTypeError } from '../errors.ts';
import { getName } from '../shared/meta.ts';
import { isMarkedInternal } from '../shared/symbols.ts';
import { safeStringify } from '../shared/stringify.ts';
import { $internal } from '../shared/symbols.ts';
import { pow } from '../std/numeric.ts';
import { add, div, mul, neg, sub } from '../std/operators.ts';
import type { FnArgsConversionHint } from '../types.ts';
import {
  convertStructValues,
  convertToCommonType,
  tryConvertSnippet,
} from './conversion.ts';
import {
  accessIndex,
  accessProp,
  concretize,
  type GenerationCtx,
  numericLiteralToSnippet,
} from './generationHelpers.ts';
import type { ShaderGenerator } from './shaderGenerator.ts';
import type { DualFn } from '../data/dualFn.ts';
import { createPtrFromOrigin, implicitFrom, ptrFn } from '../data/ptr.ts';
import { RefOperator } from '../data/ref.ts';
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

const unaryOpCodeToCodegen = {
  '-': neg[$internal].gpuImpl,
} satisfies Partial<
  Record<tinyest.UnaryOperator, (...args: never[]) => unknown>
>;

const binaryOpCodeToCodegen = {
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
    dataType: wgsl.AnyWgslData | UnknownData,
    origin: Origin,
  ): Snippet {
    const naturallyEphemeral = wgsl.isNaturallyEphemeral(dataType);

    let varOrigin: Origin;
    if (origin === 'constant-ref') {
      // Even types that aren't naturally referential (like vectors or structs) should
      // be treated as constant references when assigned to a const.
      varOrigin = 'constant-ref';
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

      if (lhsExpr.dataType.type === 'unknown') {
        throw new WgslTypeError(`Left-hand side of '${op}' is of unknown type`);
      }

      if (rhsExpr.dataType.type === 'unknown') {
        throw new WgslTypeError(
          `Right-hand side of '${op}' is of unknown type`,
        );
      }

      const codegen =
        binaryOpCodeToCodegen[op as keyof typeof binaryOpCodeToCodegen];
      if (codegen) {
        return codegen(lhsExpr, rhsExpr);
      }

      const forcedType = exprType === NODE.assignmentExpr
        ? [lhsExpr.dataType]
        : undefined;

      const [convLhs, convRhs] =
        convertToCommonType([lhsExpr, rhsExpr], forcedType) ??
          [lhsExpr, rhsExpr];

      const lhsStr = this.ctx.resolve(convLhs.value, convLhs.dataType).value;
      const rhsStr = this.ctx.resolve(convRhs.value, convRhs.dataType).value;
      const type = operatorToType(convLhs.dataType, op, convRhs.dataType);

      if (exprType === NODE.assignmentExpr) {
        if (
          convLhs.origin === 'constant' || convLhs.origin === 'constant-ref'
        ) {
          throw new WgslTypeError(
            `'${lhsStr} = ${rhsStr}' is invalid, because ${lhsStr} is a constant.`,
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

        if (!isEphemeralSnippet(rhsExpr)) {
          throw new WgslTypeError(
            `'${lhsStr} = ${rhsStr}' is invalid, because references cannot be assigned.\n-----\nTry '${lhsStr} = ${
              this.ctx.resolve(rhsExpr.dataType).value
            }(${rhsStr})' to copy the value instead.\n-----`,
          );
        }
      }

      return snip(
        parenthesizedOps.includes(op)
          ? `(${lhsStr} ${op} ${rhsStr})`
          : `${lhsStr} ${op} ${rhsStr}`,
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
        return codegen(argExpr);
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
            // A new struct, so not a reference
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
          // A new struct, so not a reference
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
        return callee.value.operator(callee.value.lhs, rhs);
      }

      if (!isMarkedInternal(callee.value)) {
        const args = argNodes.map((arg) => this.expression(arg));
        const shellless = this.ctx.shelllessRepo.get(
          callee.value as (...args: never[]) => unknown,
          args,
        );
        if (shellless) {
          const converted = args.map((s, idx) => {
            const argType = shellless.argTypes[idx] as AnyData;
            return tryConvertSnippet(s, argType, /* verbose */ false);
          });

          return this.ctx.withResetIndentLevel(() => {
            const snippet = this.ctx.resolve(shellless);
            return snip(
              stitch`${snippet.value}(${converted})`,
              snippet.dataType,
              /* origin */ 'runtime',
            );
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
      const strictSignature = (callee.value as DualFn)[$internal]
        ?.strictSignature;

      try {
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
        } else if (Array.isArray(argConversionHint)) {
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
      } catch (err) {
        if (err instanceof ResolutionError) {
          throw err;
        }

        throw new ResolutionError(err, [{
          toString: () => `fn:${getName(callee.value)}`,
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
        /* origin */ 'runtime',
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
        /* origin */ 'runtime',
      );
    }

    if (expression[0] === NODE.stringLiteral) {
      return snip(expression[1], UnknownData, /* origin */ 'runtime'); // arbitrary ref
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
        let returnSnippet = expectedReturnType
          ? this.typedExpression(
            returnNode,
            expectedReturnType,
          )
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
          returnSnippet,
          unptr(returnSnippet.dataType) as wgsl.AnyWgslData,
          false,
        );

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
      let varType: 'var' | 'let' | 'const' = 'var';
      const [stmtType, rawId, rawValue] = statement;
      const eq = rawValue !== undefined ? this.expression(rawValue) : undefined;

      if (!eq) {
        throw new Error(
          `Cannot create variable '${rawId}' without an initial value.`,
        );
      }

      const ephemeral = isEphemeralSnippet(eq);
      let dataType = eq.dataType as wgsl.AnyWgslData;
      const naturallyEphemeral = wgsl.isNaturallyEphemeral(dataType);

      if (isLooseData(eq.dataType)) {
        throw new Error(
          `Cannot create variable '${rawId}' with loose data type.`,
        );
      }

      if (eq.value instanceof RefOperator) {
        // We're assigning a newly created `d.ref()`
        if (eq.dataType.type !== 'unknown') {
          throw new WgslTypeError(
            `Cannot store d.ref() in a variable if it references another value. Copy the value passed into d.ref() instead.`,
          );
        }
        const refSnippet = eq.value.snippet;
        const varName = this.refVariable(
          rawId,
          concretize(refSnippet.dataType as AnyData) as wgsl.StorableData,
        );
        return stitch`${this.ctx.pre}var ${varName} = ${
          tryConvertSnippet(
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

        if (eq.origin === 'constant-ref') {
          varType = 'const';
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
            dataType = implicitFrom(dataType);
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
      return stitch`${this.ctx.pre}${varType} ${snippet
        .value as string} = ${tryConvertSnippet(eq, dataType, false)};`;
    }

    if (statement[0] === NODE.block) {
      return this.block(statement);
    }

    if (statement[0] === NODE.for) {
      const [_, init, condition, update, body] = statement;

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

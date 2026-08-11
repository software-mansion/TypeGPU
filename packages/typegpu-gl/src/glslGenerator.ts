import { NodeTypeCatalog as NODE } from 'tinyest';
import type { Return } from 'tinyest';
import { tgpu, d, type ShaderStage } from 'typegpu';
import {
  abstractInt,
  getName,
  snip,
  UnknownData,
  WgslGenerator,
  withValue,
} from 'typegpu/~internal';
import type {
  ResolutionCtx,
  FunctionDefinitionOptions,
  ConstantDefinitionOptions,
  VariableDefinitionOptions,
  Snippet,
  ResolvedSnippet,
} from 'typegpu/~internal';

// ----------
// WGSL → GLSL type name mapping
// ----------

const WGSL_TO_GLSL_TYPE: Record<string, string> = {
  void: 'void',
  f32: 'float',
  u32: 'uint',
  i32: 'int',
  bool: 'bool',
  f16: 'float', // approximate
  vec2f: 'vec2',
  vec3f: 'vec3',
  vec4f: 'vec4',
  vec2u: 'uvec2',
  vec3u: 'uvec3',
  vec4u: 'uvec4',
  vec2i: 'ivec2',
  vec3i: 'ivec3',
  vec4i: 'ivec4',
  'vec2<bool>': 'bvec2',
  'vec3<bool>': 'bvec3',
  'vec4<bool>': 'bvec4',
  mat2x2f: 'mat2',
  mat3x3f: 'mat3',
  mat4x4f: 'mat4',
  mat2x3f: 'mat2x3',
  mat2x4f: 'mat2x4',
  mat3x2f: 'mat3x2',
  mat3x4f: 'mat3x4',
  mat4x2f: 'mat4x2',
  mat4x3f: 'mat4x3',
};

export function translateWgslTypeToGlsl(wgslType: string): string {
  return WGSL_TO_GLSL_TYPE[wgslType] ?? wgslType;
}

/**
 * Resolves a struct and adds its declaration to the resolution context.
 * @param ctx - The resolution context.
 * @param struct - The struct to resolve.
 *
 * @returns The resolved struct name.
 */
function resolveStruct(ctx: ResolutionCtx, struct: d.WgslStruct) {
  const id = ctx.makeUniqueIdentifier(getName(struct), 'global');

  ctx.addDeclaration(`\
struct ${id} {
${Object.entries(struct.propTypes)
  .map(
    ([prop, type]) => `  ${ctx.resolve(type).value} ${prop}${resolveArraySizeSuffix(ctx, type)};\n`,
  )
  .join('')}\
};`);

  return id;
}

function correspondingBooleanVectorSchema(dataType: d.BaseData) {
  if (dataType.type.includes('2')) {
    return d.vec2b;
  }
  if (dataType.type.includes('3')) {
    return d.vec3b;
  }
  if (dataType.type.includes('4')) {
    return d.vec4b;
  }
  throw new Error(
    `Internal error: schema of type '${dataType.type}' does not have a corresponding boolean vector.`,
  );
}

function resolveArraySizeSuffix(ctx: ResolutionCtx, schema: d.BaseData | UnknownData) {
  let suffix = '';
  let current = schema;
  while (typeof current !== 'symbol' && current.type === 'array') {
    const arraySchema = current as d.WgslArray;
    suffix = `[${arraySchema.elementCount}]${suffix}`;
    current = arraySchema.elementType;
  }
  return suffix;
}

const gl_PositionSnippet = tgpu['~unstable'].rawCodeSnippet('gl_Position', d.vec4f, 'private');

interface OutVarInfo {
  varName: string;
  propName: string;
  dataType: d.BaseData;
}

interface EntryFnState {
  structPropToVarMap: Record<string, string>;
  outVars: OutVarInfo[];
  /** The first-fragment-color output name, if allocated. */
  fragColorName?: string;
}

function undecorateDataType(t: d.BaseData): d.BaseData {
  return d.isDecorated(t) ? t.inner : t;
}

function getLocationFromDecorated(type: d.BaseData): number | undefined {
  if (!d.isDecorated(type)) return undefined;
  const attr = (type.attribs as d.AnyAttribute[]).find((a) => a.type === '@location');
  return attr ? attr.params[0] : undefined;
}

function getBuiltinKindFromDecorated(type: d.BaseData): string | undefined {
  if (!d.isDecorated(type)) return undefined;
  const attr = (type.attribs as d.AnyAttribute[]).find((a) => a.type === '@builtin');
  return attr ? (attr.params[0] as string) : undefined;
}

function glslInputForBuiltin(
  builtinKind: string,
  functionType: 'vertex' | 'fragment' | 'compute',
): string | undefined {
  if (functionType === 'vertex') {
    if (builtinKind === 'vertex_index') return 'uint(gl_VertexID)';
    if (builtinKind === 'instance_index') return 'uint(gl_InstanceID)';
  } else if (functionType === 'fragment') {
    if (builtinKind === 'position') return 'gl_FragCoord';
    if (builtinKind === 'front_facing') return 'gl_FrontFacing';
    if (builtinKind === 'sample_index') return 'uint(gl_SampleID)';
    if (builtinKind === 'sample_mask') return 'uint(gl_SampleMaskIn[0])';
  }
  return undefined;
}

/**
 * State that is supposed to be shared between calls to tgpu.resolve.
 * Used to share identifiers given to uniforms across the vertex and
 * fragment shader stages.
 */
export class CrossShaderStageState {
  readonly globalIdentifierMap: Map<object, string>;

  constructor() {
    this.globalIdentifierMap = new Map();
  }
}

const ctxToCrossShaderStageStateMap = new WeakMap<ResolutionCtx, CrossShaderStageState>();

/**
 * Allows resolvables to query the cross shader stage state that has been associated
 * with the current resolution context.
 */
export function getCrossShaderStageState(ctx: ResolutionCtx) {
  const state = ctxToCrossShaderStageStateMap.get(ctx);
  if (!state) {
    throw new Error(
      `[@typegpu/gl] Internal error, mismatch between WebGL fallback and shader generator`,
    );
  }
  return state;
}

/**
 * A GLSL ES 3.0 shader generator that extends WgslGenerator.
 * Overrides `dataType` to emit GLSL type names instead of WGSL ones,
 * and overrides variable declaration emission to use `type name = rhs` syntax.
 */
export class GlslGenerator extends WgslGenerator {
  readonly #shaderStageToEmit: 'neutral' | 'vertex' | 'fragment';
  readonly #crossShaderStageState: CrossShaderStageState;

  #functionType: ShaderStage | 'normal' | undefined;
  #entryFnState: EntryFnState | undefined;
  #vertexOutPropToVarMap: Record<string, string> = {};

  static {
    GlslGenerator.prototype.languageKey = 'glsl';
  }

  constructor(
    shaderStageToEmit: 'neutral' | 'vertex' | 'fragment',
    crossShaderStageState: CrossShaderStageState,
  ) {
    super();
    this.#shaderStageToEmit = shaderStageToEmit;
    this.#crossShaderStageState = crossShaderStageState;

    this.#vertexOutPropToVarMap = {};
  }

  public initGenerator(ctx: ResolutionCtx): void {
    super.initGenerator(ctx);
    ctxToCrossShaderStageStateMap.set(ctx, this.#crossShaderStageState);

    // Reserving GLSL keywords
    ctx.reserveIdentifier('gl_Position', 'global');
    ctx.reserveIdentifier('sample', 'global'); // `sample` is a reserved word in GLSL ES (for multisample interpolation qualifiers),

    // Reserving any identifiers produced by previous shader stages
    for (const id of this.#crossShaderStageState.globalIdentifierMap.values()) {
      ctx.reserveIdentifier(id, 'global');
    }
  }

  override declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet {
    const initStr = this.ctx.resolveSnippet(options.init).value;
    const typeStr = this.ctx.resolve(options.dataType).value;

    this.ctx.addDeclaration(
      `const ${typeStr} ${options.id}${resolveArraySizeSuffix(this.ctx, options.dataType)} = ${initStr};`,
    );

    return snip(options.id, options.dataType, 'constant-immutable-def');
  }

  override declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet {
    let pre = `${this.ctx.resolve(options.dataType).value} ${options.id}${resolveArraySizeSuffix(this.ctx, options.dataType)}`;

    if (options.scope === 'private') {
      // Nothing to add
    } else if (options.scope === 'uniform') {
      pre = 'uniform ' + pre;
    } else {
      throw new Error(`Cannot define ${options.scope} variables when generating GLSL.`);
    }

    this.ctx.addDeclaration(
      options.init ? `${pre} = ${this.ctx.resolveSnippet(options.init).value};` : `${pre};`,
    );

    return snip(options.id, options.dataType, options.scope);
  }

  override typeAnnotation(data: d.BaseData): string {
    if (!d.isLooseData(data)) {
      const glslName = WGSL_TO_GLSL_TYPE[data.type];
      if (glslName !== undefined) {
        return glslName;
      }
    }

    if (d.isWgslArray(data)) {
      // The array size suffix is handled elsewhere
      return this.typeAnnotation(data.elementType);
    }

    if (d.isWgslStruct(data)) {
      return resolveStruct(this.ctx, data);
    }

    return super.typeAnnotation(data);
  }

  override call(
    name: string,
    templateParams: readonly Snippet[],
    args: readonly Snippet[],
  ): string {
    if (name === 'bitcast') {
      const [target] = templateParams;
      if (!target || !d.isWgslData(target.value)) {
        throw new Error(`Expected bitcast() to be called with a data type template parameter`);
      }
      const [source] = args;
      if (!source || source.dataType === UnknownData) {
        throw new Error(`Invalid argument passed to bitcast()`);
      }
      const targetSchema = target.value;
      const sourceSchema = source.dataType;
      const targetPrimitive = targetSchema.type.startsWith('vec')
        ? (targetSchema as d.Vec3f).primitive
        : targetSchema;
      const sourcePrimitive = sourceSchema.type.startsWith('vec')
        ? (sourceSchema as d.Vec3f).primitive
        : sourceSchema;

      if (sourcePrimitive.type === 'u32' && targetPrimitive.type === 'f32') {
        return super.call('uintBitsToFloat', [], [source]);
      }
      if (sourcePrimitive.type === 'i32' && targetPrimitive.type === 'f32') {
        return super.call('intBitsToFloat', [], [source]);
      }
      if (sourcePrimitive.type === 'f32' && targetPrimitive.type === 'u32') {
        return super.call('floatBitsToUint', [], [source]);
      }
      if (sourcePrimitive.type === 'f32' && targetPrimitive.type === 'i32') {
        return super.call('floatBitsToInt', [], [source]);
      }
      if (sourceSchema.type === targetSchema.type) {
        return this.ctx.resolveSnippet(source).value;
      }

      throw new Error(`Cannot bitcast from ${String(sourceSchema)} to ${String(targetSchema)}`);
    }

    if (name === 'select') {
      const [falsy, truthy, cond] = args;
      if (!falsy || !truthy || !cond) {
        throw new Error(`Invalid number of arguments for 'select'`);
      }

      if (falsy.dataType !== UnknownData && falsy.dataType.type.startsWith('vec')) {
        if (cond.dataType !== UnknownData && cond.dataType.type.startsWith('vec')) {
          return super.call('mix', templateParams, args);
        }
        return super.call('mix', templateParams, [
          falsy,
          truthy,
          this.typeInstantiation(correspondingBooleanVectorSchema(falsy.dataType), [cond]),
        ]);
      }

      // Generating a ternary expression, which is supported in GLSL (scalar condition only)
      if (cond.dataType !== UnknownData && cond.dataType.type.startsWith('vec')) {
        throw new Error(`GLSL select() with scalar branches requires a scalar boolean condition`);
      }

      return `(${this.ctx.resolveSnippet(cond).value} ? ${this.ctx.resolveSnippet(truthy).value} : ${this.ctx.resolveSnippet(falsy).value})`;
    }

    if (name === 'saturate') {
      const [arg] = args;
      if (!arg) {
        throw new Error(`Invalid number of arguments for 'saturate'`);
      }
      return super.call('clamp', [], [arg, snip(0, d.f32, 'constant'), snip(1, d.f32, 'constant')]);
    }

    return super.call(name, templateParams, args);
  }

  override typeInstantiation(schema: d.BaseData, args: Snippet[]): ResolvedSnippet {
    // Empty vector constructors `vecN()` are illegal in GLSL; replacing with vecN(0).
    if (schema.type.startsWith('vec') && args.length === 0) {
      return super.typeInstantiation(schema, [snip(0, abstractInt, 'constant')]);
    }

    if (schema.type === 'bool' && args.length === 0) {
      return withValue('false', super.typeInstantiation(schema, args));
    }

    if (schema.type === 'f32' && args.length === 0) {
      return withValue('0.0', super.typeInstantiation(schema, args));
    }

    if (schema.type === 'i32' && args.length === 0) {
      return withValue('0', super.typeInstantiation(schema, args));
    }

    if (schema.type === 'u32' && args.length === 0) {
      return withValue('0u', super.typeInstantiation(schema, args));
    }

    if (schema.type === 'array') {
      const superSnippet = super.typeInstantiation(schema, args);
      const arraySchema = schema as d.WgslArray;
      const element = this.ctx.resolve(arraySchema.elementType).value;
      let completeArgs = args;
      if (completeArgs.length === 0) {
        // Zero-argument constructors aren't supported in GLSL. To zero-initialize an array,
        // we need to pass all zero-initialzed elements.
        const zeroElement = this.typeInstantiation(arraySchema.elementType, args);
        completeArgs = Array.from({ length: arraySchema.elementCount }, (_) => zeroElement);
      }
      const resolvedArgs = completeArgs.map((arg) => this.ctx.resolveSnippet(arg).value).join(', ');

      return withValue(
        `${element}${resolveArraySizeSuffix(this.ctx, schema)}(${resolvedArgs})`,
        superSnippet,
      );
    }

    return super.typeInstantiation(schema, args);
  }

  public numericLiteral(value: number, schema: d.BaseData): ResolvedSnippet {
    if (!Number.isFinite(value)) {
      throw new Error(`Value '${value}' (${schema.type}) is not representable in GLSL.`);
    }

    if (schema.type === 'abstractInt' || schema.type === 'i32') {
      return snip(`${value}`, schema, /* origin */ 'constant', false);
    }
    if (schema.type === 'u32') {
      return snip(`${value}u`, schema, /* origin */ 'constant', false);
    }

    const exp = value.toExponential();
    const decimal = Number.isInteger(value) ? `${value}.0` : `${value}`;

    // Just picking the shorter one
    const base = exp.length < decimal.length ? exp : decimal;
    return snip(base, schema, /* origin */ 'constant', false);
  }

  override _emitVarDecl(
    _keyword: 'var' | 'let' | 'const',
    name: string,
    dataType: d.BaseData,
    rhsStr: string,
  ): string {
    const glslTypeName = this.ctx.resolve(dataType).value;
    return `${this.ctx.pre}${glslTypeName} ${name}${resolveArraySizeSuffix(this.ctx, dataType)} = ${rhsStr};`;
  }

  override _return(statement: Return): string {
    const exprNode = statement[1];

    if (
      exprNode === undefined ||
      this.#functionType === 'normal' ||
      this.#functionType === undefined
    ) {
      // Default behavior
      return super._return(statement);
    }

    const entryFnState = this.#entryFnState as EntryFnState;
    const expectedReturnType = this.ctx.topFunctionReturnType;

    // Case 1: Object literal return like `return { $position: ..., uv: ... }`.
    if (typeof exprNode === 'object' && exprNode[0] === NODE.objectExpr) {
      return this.#handleStructReturn(
        exprNode as unknown as [number, Record<string, unknown>],
        expectedReturnType,
        entryFnState,
      );
    }

    // Non-literal return: inspect type to decide how to assign.
    const expr = expectedReturnType
      ? this._typedExpression(exprNode, expectedReturnType)
      : this._expression(exprNode);

    if (expr.dataType === UnknownData) {
      return super._return(statement);
    }

    const exprType = expr.dataType.type;

    if (
      this.#functionType === 'fragment' &&
      typeof exprType === 'string' &&
      exprType.startsWith('vec')
    ) {
      // Fragment returning a vec directly (typically vec4). Assign to frag color output.
      const name =
        entryFnState.fragColorName ?? this.ctx.makeUniqueIdentifier('_fragColor', 'global');
      entryFnState.fragColorName = name;
      const colorSnippet = tgpu['~unstable'].rawCodeSnippet(
        name,
        expr.dataType as d.AnyData,
        'private',
      );
      const block = super._block(
        [NODE.block, [[NODE.assignmentExpr, name, '=', exprNode], [NODE.return]]],
        { [name]: colorSnippet.$ },
      );
      return `${this.ctx.pre}${block}`;
    }

    if (
      this.#functionType === 'vertex' &&
      typeof exprType === 'string' &&
      exprType.startsWith('vec')
    ) {
      // Vertex returning a vec directly -> gl_Position.
      const block = super._block(
        [NODE.block, [[NODE.assignmentExpr, 'gl_Position', '=', exprNode], [NODE.return]]],
        { gl_Position: gl_PositionSnippet.$ },
      );
      return `${this.ctx.pre}${block}`;
    }

    return super._return(statement);
  }

  #handleStructReturn(
    exprNode: [number, Record<string, unknown>],
    expectedReturnType: d.BaseData | undefined,
    entryFnState: EntryFnState,
  ): string {
    // Is this an auto-detected output struct? If so, register each prop so the
    // output struct's propTypes reflects what the body actually returns.
    const isAutoStruct = expectedReturnType?.type === 'auto-struct';
    const autoStruct = isAutoStruct
      ? (expectedReturnType as unknown as {
          completeStruct: d.WgslStruct;
          accessProp(key: string): { prop: string; type: d.BaseData } | undefined;
          provideProp(key: string, type: d.BaseData): { prop: string; type: d.BaseData };
        })
      : undefined;

    // Resolve each RHS first so module-level references get reserved (and types become
    // available) before we allocate our LHS output identifiers.
    const resolved = Object.entries(exprNode[1]).map(([prop, rhsNode]) => {
      // oxlint-disable-next-line typescript/no-explicit-any
      const rhsExpr = this._expression(rhsNode as any);
      const dataType = rhsExpr.dataType as d.BaseData;
      const rhsStr = this.ctx.resolve(rhsExpr.value, dataType).value;
      // Register the prop on the auto-struct so the caller's completeStruct picks it up.
      if (autoStruct) {
        const existing = autoStruct.accessProp(prop);
        if (!existing) {
          autoStruct.provideProp(prop, dataType);
        }
      }
      return { prop, rhsStr, dataType };
    });

    const lines: string[] = [];
    for (const { prop, rhsStr, dataType } of resolved) {
      let name: string | undefined = entryFnState.structPropToVarMap[prop];
      if (name === undefined) {
        const isPosition =
          prop === '$position' ||
          (expectedReturnType &&
            d.isWgslStruct(expectedReturnType) &&
            expectedReturnType.propTypes[prop] === d.builtin.position);
        if (isPosition) {
          name = 'gl_Position';
        } else {
          name = this.ctx.makeUniqueIdentifier(`vary_${prop}`, 'global');
          entryFnState.outVars.push({ varName: name, propName: prop, dataType });
        }
        entryFnState.structPropToVarMap[prop] = name;
        if (this.#functionType === 'vertex') {
          this.#vertexOutPropToVarMap[prop] = name;
        }
      }

      lines.push(`${this.ctx.pre}  ${name} = ${rhsStr};`);
    }

    lines.push(`${this.ctx.pre}  return;`);

    return `${this.ctx.pre}{\n${lines.join('\n')}\n${this.ctx.pre}}`;
  }

  override functionDefinition(options: FunctionDefinitionOptions): string {
    const lastFunctionType = this.#functionType;
    const lastEntryFnState = this.#entryFnState;
    this.#functionType = options.functionType;
    if (options.functionType !== 'normal') {
      if (this.#entryFnState) {
        throw new Error('Cannot nest entry functions');
      }
      this.#entryFnState = { structPropToVarMap: {}, outVars: [] };
    }

    try {
      const body = this._block(options.body);
      const returnType = options.determineReturnType();

      if (options.functionType !== 'normal') {
        if (
          this.#shaderStageToEmit === 'neutral' ||
          this.#shaderStageToEmit !== options.functionType
        ) {
          // Not the entry function this generation is supposed to generate
          return '';
        }

        const entryFnState = this.#entryFnState as EntryFnState;

        for (const { varName, dataType } of entryFnState.outVars) {
          const glslType = this.ctx.resolve(undecorateDataType(dataType)).value;
          if (options.functionType === 'fragment') {
            // Fragment color outputs keep location=N since they target draw buffers.
            this.ctx.addDeclaration(`layout(location=0) out ${glslType} ${varName};`);
          } else {
            // Varyings (vertex -> fragment) in GLSL ES 3.00 are matched by name,
            // so we don't emit layout(location=N) qualifiers here.
            this.ctx.addDeclaration(`out ${glslType} ${varName};`);
          }
        }

        // Fragment color output
        if (entryFnState.fragColorName) {
          this.ctx.addDeclaration(`layout(location=0) out vec4 ${entryFnState.fragColorName};`);
        }

        // --- Emit input-side setup: declare layout(location) in vars, and initialize
        //     struct-shaped or scalar-shaped arg variables used by the body ---
        const prelude: string[] = [];
        const stage = options.functionType as 'vertex' | 'fragment' | 'compute';
        const resolveInputForField = (prop: string, propType: d.BaseData): string => {
          const builtinKind = getBuiltinKindFromDecorated(propType);
          if (builtinKind) {
            const mapped = glslInputForBuiltin(builtinKind, stage);
            if (mapped === undefined) {
              throw new Error(`Unsupported builtin for ${stage} shader: ${builtinKind}`);
            }
            return mapped;
          }
          const location = getLocationFromDecorated(propType);
          const glslType = this.ctx.resolve(undecorateDataType(propType)).value;
          if (stage === 'vertex') {
            const inName = this.ctx.makeUniqueIdentifier(`_in_${prop}`, 'global');
            this.ctx.addDeclaration(`layout(location=${location ?? 0}) in ${glslType} ${inName};`);
            return inName;
          }
          const inName = this.#vertexOutPropToVarMap[prop];
          if (!inName) {
            throw new Error(`Unknown varying: ${prop}`);
          }
          this.ctx.addDeclaration(`in ${glslType} ${inName};`);
          return inName;
        };

        for (const arg of options.args) {
          if (!arg.used) continue;
          const argType = arg.decoratedType;

          // Auto-detected IO struct (plain-function entry fns)
          if ((argType as { type?: string }).type === 'auto-struct') {
            const autoStruct = argType as unknown as { completeStruct: d.WgslStruct };
            const completeStruct = autoStruct.completeStruct;
            const structTypeName = this.ctx.resolve(completeStruct).value;
            const initArgs: string[] = [];
            for (const [prop, propType] of Object.entries(completeStruct.propTypes)) {
              initArgs.push(resolveInputForField(prop, propType));
            }
            prelude.push(
              `  ${structTypeName} ${arg.name} = ${structTypeName}(${initArgs.join(', ')});`,
            );
            continue;
          }

          // Shell entry-fn IO struct (created from `in: {...}`): a regular WgslStruct with
          // @builtin / @location decorated fields.
          if (d.isWgslStruct(argType)) {
            const structTypeName = this.ctx.resolve(argType).value;
            const initArgs: string[] = [];
            for (const [prop, propType] of Object.entries(argType.propTypes)) {
              initArgs.push(resolveInputForField(prop, propType));
            }
            prelude.push(
              `  ${structTypeName} ${arg.name} = ${structTypeName}(${initArgs.join(', ')});`,
            );
            continue;
          }

          // Shell entry-fn positional arg: a single decorated scalar/vector (builtin or varying).
          if (d.isDecorated(argType)) {
            const inputExpr = resolveInputForField(arg.name, argType);
            const glslType = this.ctx.resolve(undecorateDataType(argType)).value;
            prelude.push(`  ${glslType} ${arg.name} = ${inputExpr};`);
          }
        }

        // Inject prelude into the body: body looks like "{\n<lines>\n}" — we insert after the opening brace.
        if (prelude.length > 0) {
          const firstNewlineIdx = body.indexOf('\n');
          const before = body.slice(0, firstNewlineIdx + 1);
          const after = body.slice(firstNewlineIdx + 1);
          return `void main() ${before}${prelude.join('\n')}\n${after}`;
        }
        return `void main() ${body}`;
      }

      const argList = options.args
        .map((arg) => `${this.ctx.resolve(arg.decoratedType).value} ${arg.name}`)
        .join(', ');

      return `${this.ctx.resolve(returnType).value} ${options.name}(${argList}) ${body}`;
    } finally {
      this.#functionType = lastFunctionType;
      this.#entryFnState = lastEntryFnState;
    }
  }
}

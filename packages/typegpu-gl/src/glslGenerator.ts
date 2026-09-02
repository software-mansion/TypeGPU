import { NodeTypeCatalog as NODE } from 'tinyest';
import type { Expression, Return } from 'tinyest';
import { tgpu, d, type ShaderStage, std } from 'typegpu';
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
  Origin,
  Snippet,
  ResolvedSnippet,
  ResolvedStatement,
  BinaryOperator,
} from 'typegpu/~internal';

/**
 * Reference: https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
 */
const reservedKeywords = [
  //
  // Defined keywords
  //
  'const',
  'uniform',
  'layout',
  'centroid',
  'flat',
  'smooth',
  'break',
  'continue',
  'do',
  'for',
  'while',
  'switch',
  'case',
  'default',
  'if',
  'else',
  'in',
  'out',
  'inout',
  'float',
  'int',
  'void',
  'bool',
  'true',
  'false',
  'invariant',
  'discard',
  'return',
  'mat2',
  'mat3',
  'mat4',
  'mat2x2',
  'mat2x3',
  'mat2x4',
  'mat3x2',
  'mat3x3',
  'mat3x4',
  'mat4x2',
  'mat4x3',
  'mat4x4',
  'vec2',
  'vec3',
  'vec4',
  'ivec2',
  'ivec3',
  'ivec4',
  'bvec2',
  'bvec3',
  'bvec4',
  'uint',
  'uvec2',
  'uvec3',
  'uvec4',
  'lowp',
  'mediump',
  'highp',
  'precision',
  'sampler2D',
  'sampler3D',
  'samplerCube',
  'sampler2DShadow',
  'samplerCubeShadow',
  'sampler2DArray',
  'sampler2DArrayShadow',
  'isampler2D',
  'isampler3D',
  'isamplerCube',
  'isampler2DArray',
  'usampler2D',
  'usampler3D',
  'usamplerCube',
  'usampler2DArray',
  'struct',
  //
  // Reserved for future use
  //
  'attribute',
  'varying',
  'coherent',
  'volatile',
  'restrict',
  'readonly',
  'writeonly',
  'resource',
  'atomic_uint',
  'noperspective',
  'patch',
  'sample',
  'subroutine',
  'common',
  'partition',
  'active',
  'asm',
  'class',
  'union',
  'enum',
  'typedef',
  'template',
  'this',
  'goto',
  'inline',
  'noinline',
  'public',
  'static',
  'extern',
  'external',
  'interface',
  'long',
  'short',
  'double',
  'half',
  'fixed',
  'unsigned',
  'superp',
  'input',
  'output',
  'hvec2',
  'hvec3',
  'hvec4',
  'dvec2',
  'dvec3',
  'dvec4',
  'fvec2',
  'fvec3',
  'fvec4',
  'sampler3DRect',
  'filter',
  'image1D',
  'image2D',
  'image3D',
  'imageCube',
  'iimage1D',
  'iimage2D',
  'iimage3D',
  'iimageCube',
  'uimage1D',
  'uimage2D',
  'uimage3D',
  'uimageCube',
  'image1DArray',
  'image2DArray',
  'iimage1DArray',
  'iimage2DArray',
  'uimage1DArray',
  'uimage2DArray',
  'imageBuffer',
  'iimageBuffer',
  'uimageBuffer',
  'sampler1D',
  'sampler1DShadow',
  'sampler1DArray',
  'sampler1DArrayShadow',
  'isampler1D',
  'isampler1DArray',
  'usampler1D',
  'usampler1DArray',
  'sampler2DRect',
  'sampler2DRectShadow',
  'isampler2DRect',
  'usampler2DRect',
  'samplerBuffer',
  'isamplerBuffer',
  'usamplerBuffer',
  'sampler2DMS',
  'isampler2DMS',
  'usampler2DMS',
  'sampler2DMSArray',
  'isampler2DMSArray',
  'usampler2DMSArray',
  'sizeof',
  'cast',
  'namespace',
  'using',
];

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

/**
 * Origins of values that cannot be mutated for the whole duration of a shader's
 * execution. Taking a reference to them is equivalent to copying them.
 */
const immutableOrigins: readonly Origin[] = ['uniform', 'readonly', 'handle'];

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
  readonly textureSamplerPairs: Map<string, string>;
  readonly textureFlipIdentifiers: Map<string, string>;

  constructor() {
    this.globalIdentifierMap = new Map();
    this.textureSamplerPairs = new Map();
    this.textureFlipIdentifiers = new Map();
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

function isF32VecfSchema(
  schema: d.BaseData | UnknownData,
): schema is d.F32 | d.Vec2f | d.Vec3f | d.Vec4f {
  return (
    schema !== UnknownData &&
    (schema.type === 'f32' ||
      schema.type === 'vec2f' ||
      schema.type === 'vec3f' ||
      schema.type === 'vec4f')
  );
}

const HELPERS = {
  // TODO(#2821): Make signature more accurate when std.sign and std.abs
  // accept a wider union
  remainder: (x: number, y: number): number => {
    'use gpu';
    const truncDiv = std.sign(x / y) * std.floor(std.abs(x / y));
    return x - y * truncDiv;
  },
  flipYConditionally: (coords: d.v2f, flip: boolean): d.v2f => {
    'use gpu';
    return std.select(coords, d.vec2f(coords.x, 1 - coords.y), flip);
  },
};

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

  override initGenerator(ctx: ResolutionCtx): void {
    super.initGenerator(ctx);
    ctxToCrossShaderStageStateMap.set(ctx, this.#crossShaderStageState);

    // Reserving GLSL keywords
    for (const keyword of reservedKeywords) {
      ctx.reserveIdentifier(keyword, 'global');
    }

    // Reserving any identifiers produced by previous shader stages
    for (const id of this.#crossShaderStageState.globalIdentifierMap.values()) {
      ctx.reserveIdentifier(id, 'global');
    }
    for (const id of this.#crossShaderStageState.textureFlipIdentifiers.values()) {
      ctx.reserveIdentifier(id, 'global');
    }
  }

  override declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet {
    if (options.id.startsWith('gl_')) {
      throw new Error(`User-defined constants cannot start with 'gl_'`);
    }

    const initStr = this.ctx.resolveSnippet(options.init).value;
    const typeStr = this.ctx.resolve(options.dataType).value;

    this.ctx.addDeclaration(
      `const ${typeStr} ${options.id}${resolveArraySizeSuffix(this.ctx, options.dataType)} = ${initStr};`,
    );

    return snip(options.id, options.dataType, 'constant-immutable-def');
  }

  override declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet {
    if (options.id.startsWith('gl_')) {
      throw new Error(`User-defined variables cannot start with 'gl_'`);
    }

    if (options.scope === 'handle') {
      if (options.dataType.type === 'sampler' || options.dataType.type === 'sampler_comparison') {
        // WebGPU models textures and samplers as separate bindings. GLSL ES combines
        // both in the texture uniform, so a standalone sampler declaration is not needed.
        return snip(options.id, options.dataType, 'handle');
      }

      if (options.dataType.type === 'texture_2d') {
        const sampleType = (options.dataType as d.WgslTexture2d).sampleType.type;
        const glslType =
          sampleType === 'u32' ? 'usampler2D' : sampleType === 'i32' ? 'isampler2D' : 'sampler2D';
        let flipId = this.#crossShaderStageState.textureFlipIdentifiers.get(options.id);
        if (!flipId) {
          flipId = this.ctx.makeUniqueIdentifier(`${options.id}_flipY`, 'global');
          this.#crossShaderStageState.textureFlipIdentifiers.set(options.id, flipId);
        }
        this.ctx.addDeclaration(`uniform ${glslType} ${options.id};`);
        this.ctx.addDeclaration(`uniform bool ${flipId};`);
        return snip(options.id, options.dataType, 'handle');
      }

      throw new Error(`Cannot define a '${options.dataType.type}' handle when generating GLSL.`);
    }

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

  override emitTypeAnnotation(data: d.BaseData): string {
    if (data.type === 'texture_2d') {
      const sampleType = (data as d.WgslTexture2d).sampleType.type;
      return sampleType === 'u32'
        ? 'usampler2D'
        : sampleType === 'i32'
          ? 'isampler2D'
          : 'sampler2D';
    }

    if (data.type === 'sampler' || data.type === 'sampler_comparison') {
      throw new Error(`Samplers by themselves aren't represented in GLSL`);
    }

    if (!d.isLooseData(data)) {
      const glslName = WGSL_TO_GLSL_TYPE[data.type];
      if (glslName !== undefined) {
        return glslName;
      }
    }

    if (d.isWgslArray(data)) {
      // The array size suffix is handled elsewhere
      return this.emitTypeAnnotation(data.elementType);
    }

    if (d.isWgslStruct(data)) {
      return resolveStruct(this.ctx, data);
    }

    return super.emitTypeAnnotation(data);
  }

  #normalizeTextureArrayArguments(args: readonly Snippet[]): Snippet[] {
    const [texture] = args;
    const newArgs = [...args];
    if (!texture) {
      // Opt out of normalization
      return newArgs;
    }

    const isTextureArray = (texture.dataType as d.WgslTexture).dimension === '2d-array';

    // Find the first vector parameter (the uv coordinates)
    const coordsIdx = args.findIndex((arg) => (arg.dataType as d.AnyWgslData).type.includes('vec'));
    const coords = args[coordsIdx];

    if (!coords) {
      // Opt out of normalization
      return newArgs;
    }

    const textureName = this.ctx.resolveSnippet(texture).value;
    const flipId = this.#crossShaderStageState.textureFlipIdentifiers.get(textureName);
    const orientedCoords = flipId
      ? (this._callShellless(HELPERS.flipYConditionally, [
          coords,
          snip(flipId, d.bool, 'uniform'),
        ]) ?? coords)
      : coords;

    if (isTextureArray) {
      // We need to merge the array_index parameter with the preceding coordinates
      const arrayIdx = args[coordsIdx + 1];
      if (!coords || !arrayIdx) {
        // Opt out of normalization
        return newArgs;
      }
      const coordsType = coords.dataType as d.Vec2f | d.Vec2u | d.Vec2i;
      if (coordsType.primitive.type === 'f32') {
        newArgs.splice(coordsIdx, 2, this.typeInstantiation(d.vec3f, [orientedCoords, arrayIdx]));
      }
      if (coordsType.primitive.type === 'u32') {
        newArgs.splice(coordsIdx, 2, this.typeInstantiation(d.vec3u, [orientedCoords, arrayIdx]));
      }
      if (coordsType.primitive.type === 'i32') {
        newArgs.splice(coordsIdx, 2, this.typeInstantiation(d.vec3i, [orientedCoords, arrayIdx]));
      }
    } else {
      newArgs.splice(coordsIdx, 1, orientedCoords);
    }

    return newArgs;
  }

  override emitCall(
    name: string,
    templateParams: readonly Snippet[],
    args: readonly Snippet[],
  ): string {
    if (name === 'textureSample' || name === 'textureSampleBias' || name === 'textureSampleLevel') {
      const [texture, sampler, coords, ...rest] = this.#normalizeTextureArrayArguments(args);
      if (!texture || !sampler || !coords) {
        throw new Error(`Invalid number of arguments for '${name}'`);
      }

      const textureName = this.ctx.resolveSnippet(texture).value;
      const samplerName = this.ctx.resolveSnippet(sampler).value;
      const coordsValue = this.ctx.resolveSnippet(coords).value;
      const flipId = this.#crossShaderStageState.textureFlipIdentifiers.get(textureName);

      const existingSampler = this.#crossShaderStageState.textureSamplerPairs.get(textureName);
      if (existingSampler && existingSampler !== samplerName) {
        throw new Error(
          `WebGL fallback does not support sampling the same texture with multiple samplers in one pipeline ('${textureName}').`,
        );
      }
      this.#crossShaderStageState.textureSamplerPairs.set(textureName, samplerName);

      if (name === 'textureSampleLevel') {
        const [level, offset] = rest;
        if (!level) throw new Error(`Invalid number of arguments for '${name}'`);

        const levelValue = this.ctx.resolveSnippet(level).value;
        return offset
          ? `textureLodOffset(${textureName}, ${coordsValue}, ${levelValue}, ${this.#orientedTextureOffset(offset, flipId)})`
          : `textureLod(${textureName}, ${coordsValue}, ${levelValue})`;
      }
      if (name === 'textureSampleBias') {
        const [bias, offset] = rest;
        if (!bias) throw new Error(`Invalid number of arguments for '${name}'`);
        const biasValue = this.ctx.resolveSnippet(bias).value;
        return offset
          ? `textureOffset(${textureName}, ${coordsValue}, ${this.#orientedTextureOffset(offset, flipId)}, ${biasValue})`
          : `texture(${textureName}, ${coordsValue}, ${biasValue})`;
      }

      const [offset] = rest;
      return offset
        ? `textureOffset(${textureName}, ${coordsValue}, ${this.#orientedTextureOffset(offset, flipId)})`
        : `texture(${textureName}, ${coordsValue})`;
    }

    if (name === 'textureLoad') {
      const [texture, coords, arrayIndexOrLevel, arrayLevel] = args;
      if (!texture || !coords || !arrayIndexOrLevel) {
        throw new Error(`Invalid number of arguments for '${name}'`);
      }

      const textureType = (texture.dataType as d.WgslTexture).type;
      const isTextureArray =
        textureType === 'texture_2d_array' || textureType === 'texture_depth_2d_array';
      const level = isTextureArray ? arrayLevel : arrayIndexOrLevel;
      if (!level) {
        throw new Error(`Invalid number of arguments for '${name}'`);
      }

      const textureName = this.ctx.resolveSnippet(texture).value;
      const coordsValue = this.ctx.resolveSnippet(coords).value;
      const signedCoordsValue =
        coords.dataType !== UnknownData && coords.dataType.type === 'vec2u'
          ? `ivec2(${coordsValue})`
          : coords.dataType !== UnknownData && coords.dataType.type === 'vec3u'
            ? `ivec3(${coordsValue})`
            : coordsValue;
      const levelValue = this.ctx.resolveSnippet(level).value;
      const flipId = this.#crossShaderStageState.textureFlipIdentifiers.get(textureName);
      const orientedCoords = flipId
        ? `ivec2(${signedCoordsValue}.x, ${flipId} ? textureSize(${textureName}, ${levelValue}).y - 1 - int(${signedCoordsValue}.y) : int(${signedCoordsValue}.y))`
        : signedCoordsValue;

      if (isTextureArray) {
        const arrayIndexValue = this.ctx.resolveSnippet(arrayIndexOrLevel).value;
        const signedArrayIndex =
          arrayIndexOrLevel.dataType !== UnknownData && arrayIndexOrLevel.dataType.type === 'u32'
            ? `int(${arrayIndexValue})`
            : arrayIndexValue;
        return `texelFetch(${textureName}, ivec3(${orientedCoords}, ${signedArrayIndex}), ${levelValue})`;
      }

      return `texelFetch(${textureName}, ${orientedCoords}, ${levelValue})`;
    }

    if (name === 'textureDimensions') {
      const [texture, level] = args;
      if (!texture) throw new Error(`Invalid number of arguments for '${name}'`);
      return `uvec2(textureSize(${this.ctx.resolveSnippet(texture).value}, ${level ? this.ctx.resolveSnippet(level).value : '0'}))`;
    }

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
        return super.emitCall('uintBitsToFloat', [], [source]);
      }
      if (sourcePrimitive.type === 'i32' && targetPrimitive.type === 'f32') {
        return super.emitCall('intBitsToFloat', [], [source]);
      }
      if (sourcePrimitive.type === 'f32' && targetPrimitive.type === 'u32') {
        return super.emitCall('floatBitsToUint', [], [source]);
      }
      if (sourcePrimitive.type === 'f32' && targetPrimitive.type === 'i32') {
        return super.emitCall('floatBitsToInt', [], [source]);
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
          return super.emitCall('mix', templateParams, args);
        }
        return super.emitCall('mix', templateParams, [
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
      return super.emitCall(
        'clamp',
        [],
        [arg, snip(0, d.f32, 'constant'), snip(1, d.f32, 'constant')],
      );
    }

    return super.emitCall(name, templateParams, args);
  }

  #orientedTextureOffset(offset: Snippet, flipId: string | undefined): string {
    const value = this.ctx.resolveSnippet(offset).value;
    return flipId ? `(${flipId} ? ivec2(${value}.x, -${value}.y) : ${value})` : value;
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
    if (name.startsWith('gl_')) {
      throw new Error(`User-defined variables cannot start with 'gl_'`);
    }

    const glslTypeName = this.ctx.resolve(dataType).value;
    return `${this.ctx.pre}${glslTypeName} ${name}${resolveArraySizeSuffix(this.ctx, dataType)} = ${rhsStr};`;
  }

  override emitBinaryOp(lhs: Snippet, op: BinaryOperator, rhs: Snippet): string {
    if (op === '%' && (isF32VecfSchema(lhs.dataType) || isF32VecfSchema(rhs.dataType))) {
      const result = this._callShellless(HELPERS.remainder, [lhs, rhs]);
      if (!result) {
        const lhsStr = this.ctx.resolveSnippet(lhs).value;
        const rhsStr = this.ctx.resolveSnippet(rhs).value;
        throw new Error(
          `[@typegpu/gl] Invalid use of '%', incompatible with the GLSL generator: ${lhsStr} (type: ${String(lhs.dataType)}) ${op} ${rhsStr} (type: ${String(rhs.dataType)})`,
        );
      }
      return result.value;
    }

    return super.emitBinaryOp(lhs, op, rhs);
  }

  /**
   * GLSL has no pointers, so `const x = <alias>;` cannot be turned into an implicit
   * pointer definition like it is in WGSL. Instead:
   * - if the aliased memory is immutable for the whole shader run (uniforms, ...), we
   *   copy the value, which is indistinguishable from referencing it,
   * - otherwise `x` becomes an alias, meaning every use of it is replaced with the
   *   expression it points to. Index expressions are hoisted into variables first, so
   *   that they're evaluated exactly once, at the point of the declaration.
   */
  protected override _aliasConstStatement(
    rawId: string,
    eqNode: Expression,
    eq: Snippet,
  ): ResolvedStatement {
    if (rawId.startsWith('gl_')) {
      throw new Error(`User-defined variables cannot start with 'gl_'`);
    }

    if (immutableOrigins.includes(eq.origin)) {
      const dataType = eq.dataType as d.BaseData;
      const name = this.ctx.makeUniqueIdentifier(rawId, 'block');
      this.ctx.defineVariable(rawId, snip(name, dataType, 'runtime-immutable-def', false));
      return {
        code: this._emitVarDecl('let', name, dataType, this.ctx.resolveSnippet(eq).value),
        definesInNearestScope: true,
      };
    }

    // The aliased memory can change over time, so copying would alter the semantics.
    const hoisted: string[] = [];
    const aliased = this._expression(this.#hoistIndexAccesses(eqNode, hoisted));

    this.ctx.defineVariable(
      rawId,
      snip(
        this.ctx.resolveSnippet(aliased).value,
        aliased.dataType as d.BaseData,
        aliased.origin,
        false,
      ),
    );

    return {
      code: hoisted.join('\n'),
      definesInNearestScope: true,
    };
  }

  /**
   * Replaces every index expression in `node` that could change value over time with a
   * reference to a freshly declared variable, whose declaration is appended to `out`.
   *
   * @example
   * ```
   * arr[foo()].prop[idx]  =>  arr[item].prop[item_1]
   * // out: ['int item = foo();', 'int item_1 = idx;']
   * ```
   */
  #hoistIndexAccesses(node: Expression, out: string[]): Expression {
    if (typeof node !== 'object') {
      return node;
    }

    if (node[0] === NODE.memberAccess) {
      return [NODE.memberAccess, this.#hoistIndexAccesses(node[1], out), node[2]];
    }

    if (node[0] === NODE.indexAccess) {
      const target = this.#hoistIndexAccesses(node[1], out);
      const index = this._expression(node[2]);

      if (
        !index.possibleSideEffects &&
        (index.origin === 'constant' || index.origin === 'constant-immutable-def')
      ) {
        // Known at comptime, so it cannot change between now and the uses of the alias.
        // It also cannot have side-effects, so it can just be copied in many places.
        return [NODE.indexAccess, target, node[2]];
      }

      const resolved = this.ctx.resolveSnippet(index);
      const name = this.ctx.makeUniqueIdentifier('idx', 'block');
      out.push(this._emitVarDecl('let', name, resolved.dataType, resolved.value));
      this.ctx.defineVariable(name, snip(name, resolved.dataType, 'runtime-immutable-def', false));
      return [NODE.indexAccess, target, name];
    }

    return node;
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
        /* allowInlining */ true,
        { [name]: colorSnippet.$ },
      );
      return `${this.ctx.pre}${block.code}`;
    }

    if (
      this.#functionType === 'vertex' &&
      typeof exprType === 'string' &&
      exprType.startsWith('vec')
    ) {
      // Vertex returning a vec directly -> gl_Position.
      const block = super._block(
        [NODE.block, [[NODE.assignmentExpr, 'gl_Position', '=', exprNode], [NODE.return]]],
        /* allowInlining */ true,
        { gl_Position: gl_PositionSnippet.$ },
      );
      return `${this.ctx.pre}${block.code}`;
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
          entryFnState.outVars.push({
            varName: name,
            propName: prop,
            dataType,
          });
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
      const body = this._block(options.body, /* allowInlining */ false).code;
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
            const autoStruct = argType as unknown as {
              completeStruct: d.WgslStruct;
            };
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
        return `void main() ${body || '{}'}`;
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

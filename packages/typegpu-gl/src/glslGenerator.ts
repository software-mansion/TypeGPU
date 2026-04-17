import { NodeTypeCatalog as NODE } from 'tinyest';
import type { Return } from 'tinyest';
import tgpu, { d, ShaderGenerator, WgslGenerator } from 'typegpu';

type ResolutionCtx = ShaderGenerator.ResolutionCtx;

const UnknownData: typeof ShaderGenerator.UnknownData = ShaderGenerator.UnknownData;

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

function resolveStruct(ctx: ResolutionCtx, struct: d.WgslStruct) {
  const id = ctx.makeUniqueIdentifier(ShaderGenerator.getName(struct), 'global');

  ctx.addDeclaration(`\
struct ${id} {
${Object.entries(struct.propTypes)
  .map(([prop, type]) => `  ${ctx.resolve(type).value} ${prop};\n`)
  .join('')}\
};`);

  return id;
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
  /** The auto-output struct (populated as the body resolves). */
  autoOutStruct?: {
    completeStruct: d.WgslStruct;
    accessProp(key: string): { prop: string; type: d.BaseData } | undefined;
    provideProp(key: string, type: d.BaseData): { prop: string; type: d.BaseData };
  };
}

function undecorateDataType(t: d.BaseData): d.BaseData {
  return d.isDecorated(t) ? (t.inner as d.BaseData) : t;
}

function getLocationFromDecorated(type: d.BaseData): number | undefined {
  if (!d.isDecorated(type)) return undefined;
  const attr = (type.attribs as d.AnyAttribute[]).find((a) => a.type === '@location');
  return attr ? (attr.params[0] as number) : undefined;
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
 * A GLSL ES 3.0 shader generator that extends WgslGenerator.
 * Overrides `dataType` to emit GLSL type names instead of WGSL ones,
 * and overrides variable declaration emission to use `type name = rhs` syntax.
 */
export class GlslGenerator extends WgslGenerator {
  #functionType: ShaderGenerator.TgpuShaderStage | 'normal' | undefined;
  #entryFnState: EntryFnState | undefined;

  override typeAnnotation(data: d.BaseData): string {
    if (!d.isLooseData(data)) {
      const glslName = WGSL_TO_GLSL_TYPE[data.type];
      if (glslName !== undefined) {
        return glslName;
      }
    }

    if (d.isWgslStruct(data)) {
      return resolveStruct(this.ctx, data);
    }

    return super.typeAnnotation(data);
  }

  override _emitVarDecl(
    _keyword: 'var' | 'let' | 'const',
    name: string,
    dataType: d.BaseData | ShaderGenerator.UnknownData,
    rhsStr: string,
  ): string {
    const glslTypeName = dataType !== UnknownData ? this.ctx.resolve(dataType).value : 'auto';
    return `${this.ctx.pre}${glslTypeName} ${name} = ${rhsStr};`;
  }

  override _returnStatement(statement: Return): string {
    const exprNode = statement[1];

    if (exprNode === undefined || this.#functionType === 'normal' || this.#functionType === undefined) {
      return super._returnStatement(statement);
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
      return super._returnStatement(statement);
    }

    const exprType = (expr.dataType as d.BaseData).type;

    if (this.#functionType === 'fragment' && typeof exprType === 'string' && exprType.startsWith('vec')) {
      // Fragment returning a vec directly (typically vec4). Assign to frag color output.
      const name = entryFnState.fragColorName ?? this.ctx.makeUniqueIdentifier('_fragColor', 'global');
      entryFnState.fragColorName = name;
      const colorSnippet = tgpu['~unstable'].rawCodeSnippet(name, expr.dataType as d.AnyData, 'private');
      const block = super._block(
        [NODE.block, [[NODE.assignmentExpr, name, '=', exprNode], [NODE.return]]],
        { [name]: colorSnippet.$ },
      );
      return `${this.ctx.pre}${block}`;
    }

    if (this.#functionType === 'vertex' && typeof exprType === 'string' && exprType.startsWith('vec')) {
      // Vertex returning a vec directly -> gl_Position.
      const block = super._block(
        [NODE.block, [[NODE.assignmentExpr, 'gl_Position', '=', exprNode], [NODE.return]]],
        { gl_Position: gl_PositionSnippet.$ },
      );
      return `${this.ctx.pre}${block}`;
    }

    return super._returnStatement(statement);
  }

  #handleStructReturn(
    exprNode: [number, Record<string, unknown>],
    expectedReturnType: d.BaseData | undefined,
    entryFnState: EntryFnState,
  ): string {
    // Is this an auto-detected output struct? If so, register each prop so the
    // output struct's propTypes reflects what the body actually returns.
    const isAutoStruct = expectedReturnType !== undefined &&
      (expectedReturnType as { type?: string }).type === 'auto-struct';
    const autoStruct = isAutoStruct
      ? (expectedReturnType as unknown as {
        completeStruct: d.WgslStruct;
        accessProp(key: string): { prop: string; type: d.BaseData } | undefined;
        provideProp(key: string, type: d.BaseData): { prop: string; type: d.BaseData };
      })
      : undefined;
    if (autoStruct) {
      entryFnState.autoOutStruct = autoStruct;
    }

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
          // Name varyings consistently between vertex out / fragment in so the GLSL
          // ES 3.00 linker can match them by name.
          const wgslKey = prop.replaceAll('$', '');
          name = this.ctx.makeUniqueIdentifier(`vary_${wgslKey}`, 'global');
          entryFnState.outVars.push({ varName: name, propName: prop, dataType });
        }
        entryFnState.structPropToVarMap[prop] = name;
      }

      // Copy-wrap the RHS in its type constructor so references get turned into values.
      const glslType = this.ctx.resolve(undecorateDataType(dataType)).value;
      lines.push(`${this.ctx.pre}  ${name} = ${glslType}(${rhsStr});`);
    }

    lines.push(`${this.ctx.pre}  return;`);

    return `${this.ctx.pre}{\n${lines.join('\n')}\n${this.ctx.pre}}`;
  }

  override functionDefinition(options: ShaderGenerator.FunctionDefinitionOptions): string {
    if (options.functionType !== 'normal') {
      this.ctx.reserveIdentifier('gl_Position', 'global');
    }

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
        const entryFnState = this.#entryFnState as EntryFnState;

        // --- Emit output declarations (layout(location=N) out TYPE NAME;) ---
        // Prefer the auto-output struct if we collected one during body resolution;
        // it carries @location attributes computed via withVaryingLocations.
        const outStructForDecls = entryFnState.autoOutStruct
          ? entryFnState.autoOutStruct.completeStruct
          : d.isWgslStruct(returnType)
            ? returnType
            : undefined;
        if (outStructForDecls) {
          for (const { varName, dataType } of entryFnState.outVars) {
            // Varyings (vertex -> fragment) in GLSL ES 3.00 are matched by name,
            // so we don't emit layout(location=N) qualifiers here.
            const glslType = this.ctx.resolve(undecorateDataType(dataType)).value;
            if (options.functionType === 'fragment') {
              // Fragment color outputs keep location=N since they target draw buffers.
              this.ctx.addDeclaration(
                `layout(location = 0) out ${glslType} ${varName};`,
              );
            } else {
              this.ctx.addDeclaration(`out ${glslType} ${varName};`);
            }
          }
        }
        // Fragment color output
        if (entryFnState.fragColorName) {
          this.ctx.addDeclaration(`layout(location = 0) out vec4 ${entryFnState.fragColorName};`);
        }

        // --- Emit input-side setup: declare layout(location) in vars, and initialize _arg_N structs ---
        const prelude: string[] = [];
        for (const arg of options.args) {
          if (!arg.used) continue;
          const argType = arg.decoratedType as d.BaseData;
          // AutoStruct args (entry fn auto-detected inputs):
          // Identified via `type === 'auto-struct'`.
          if ((argType as { type?: string }).type === 'auto-struct') {
            const autoStruct = argType as unknown as {
              completeStruct: d.WgslStruct;
            };
            const completeStruct = autoStruct.completeStruct;
            const structTypeName = this.ctx.resolve(completeStruct).value;
            const initArgs: string[] = [];
            for (const [prop, propType] of Object.entries(completeStruct.propTypes)) {
              const builtinKind = getBuiltinKindFromDecorated(propType);
              if (builtinKind) {
                const mapped = glslInputForBuiltin(
                  builtinKind,
                  options.functionType as 'vertex' | 'fragment' | 'compute',
                );
                if (mapped === undefined) {
                  throw new Error(
                    `Unsupported builtin for ${options.functionType} shader: ${builtinKind}`,
                  );
                }
                initArgs.push(mapped);
              } else {
                const location = getLocationFromDecorated(propType);
                const glslType = this.ctx.resolve(undecorateDataType(propType)).value;
                if (options.functionType === 'vertex') {
                  // Vertex attribute input — keep layout(location=N); safe in ES 3.00.
                  const inName = this.ctx.makeUniqueIdentifier(`_in_${prop}`, 'global');
                  this.ctx.addDeclaration(
                    `layout(location = ${location ?? 0}) in ${glslType} ${inName};`,
                  );
                  initArgs.push(inName);
                } else {
                  // Fragment varying input — matched by name to the vertex output.
                  const inName = this.ctx.makeUniqueIdentifier(`vary_${prop}`, 'global');
                  this.ctx.addDeclaration(`in ${glslType} ${inName};`);
                  initArgs.push(inName);
                }
              }
            }
            prelude.push(`  ${structTypeName} ${arg.name} = ${structTypeName}(${initArgs.join(', ')});`);
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
        .filter((arg) => arg.used || options.functionType === 'normal')
        .map((arg) => {
          return `${this.ctx.resolve(arg.decoratedType).value} ${arg.name}`;
        })
        .join(', ');

      return `${this.ctx.resolve(returnType).value} ${options.name}(${argList}) ${body}`;
    } finally {
      this.#functionType = lastFunctionType;
      this.#entryFnState = lastEntryFnState;
    }
  }
}

const glslGenerator: GlslGenerator = new GlslGenerator();
export default glslGenerator;

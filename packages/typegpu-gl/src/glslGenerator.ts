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

/**
 * Resolves a struct and adds its declaration to the resolution context.
 * @param ctx - The resolution context.
 * @param struct - The struct to resolve.
 *
 * @returns The resolved struct name.
 */
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

interface EntryFnState {
  structPropToVarMap: Record<string, string>;
  outVars: { varName: string; propName: string }[];
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
    // For WGSL identity types (scalars, vectors, common matrices), map to GLSL directly.
    if (!d.isLooseData(data)) {
      const glslName = WGSL_TO_GLSL_TYPE[data.type];
      if (glslName !== undefined) {
        return glslName;
      }
    }

    if (d.isWgslStruct(data)) {
      return resolveStruct(this.ctx, data);
    }

    // For all other types (structs, arrays, etc.) delegate to WGSL resolution.
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

    if (exprNode === undefined) {
      // Default behavior
      return super._returnStatement(statement);
    }

    if (this.#functionType !== 'normal') {
      // oxlint-disable-next-line no-non-null-assertion
      const entryFnState = this.#entryFnState!;
      const expectedReturnType = this.ctx.topFunctionReturnType;

      if (typeof exprNode === 'object' && exprNode[0] === NODE.objectExpr) {
        const transformed = Object.entries(exprNode[1]).map(([prop, rhsNode]) => {
          let name: string | undefined = entryFnState.structPropToVarMap[prop];
          if (name === undefined) {
            if (
              prop === '$position' ||
              (expectedReturnType &&
                d.isWgslStruct(expectedReturnType) &&
                expectedReturnType.propTypes[prop] === d.builtin.position)
            ) {
              name = 'gl_Position';
            } else {
              name = this.ctx.makeUniqueIdentifier(prop, 'global');
              entryFnState.outVars.push({ varName: name, propName: prop });
            }
            entryFnState.structPropToVarMap[prop] = name;
          }
          const rhsExpr = this._expression(rhsNode);
          const type = rhsExpr.dataType as d.BaseData;

          const snippet = tgpu['~unstable'].rawCodeSnippet(name, type as d.AnyData, 'private');

          return {
            name,
            snippet,
            assignment: [NODE.assignmentExpr, name, '=', rhsNode],
          } as const;
        });

        const block = super._block(
          [NODE.block, [...transformed.map((t) => t.assignment), [NODE.return]]],
          Object.fromEntries(
            transformed.map(({ name, snippet }) => {
              return [name, snippet.$] as const;
            }),
          ),
        );

        return `${this.ctx.pre}${block}`;
      } else {
        // Resolving the expression to inspect it's type
        // We will resolve it again as part of the modifed statement
        const expr = expectedReturnType
          ? this._typedExpression(exprNode, expectedReturnType)
          : this._expression(exprNode);

        if (expr.dataType === UnknownData) {
          // Unknown data type, don't know what to do
          return super._returnStatement(statement);
        }

        if (expr.dataType.type.startsWith('vec')) {
          const block = super._block(
            [NODE.block, [[NODE.assignmentExpr, 'gl_Position', '=', exprNode], [NODE.return]]],
            { gl_Position: gl_PositionSnippet.$ },
          );

          return `${this.ctx.pre}${block}`;
        }
      }
    }

    return super._returnStatement(statement);
  }

  override functionDefinition(options: ShaderGenerator.FunctionDefinitionOptions): string {
    if (options.functionType !== 'normal') {
      this.ctx.reserveIdentifier('gl_Position', 'global');
    }

    // Function body
    let lastFunctionType = this.#functionType;
    this.#functionType = options.functionType;
    if (options.functionType !== 'normal') {
      if (this.#entryFnState) {
        throw new Error('Cannot nest entry functions');
      }
      this.#entryFnState = { structPropToVarMap: {}, outVars: [] };
    }

    try {
      const body = this._block(options.body);

      // Only after generating the body can we determine the return type
      const returnType = options.determineReturnType();

      if (options.functionType !== 'normal') {
        // oxlint-disable-next-line no-non-null-assertion
        const entryFnState = this.#entryFnState!;
        if (d.isWgslStruct(returnType)) {
          for (const { varName, propName } of entryFnState.outVars) {
            const dataType = returnType.propTypes[propName];
            if (dataType && d.isDecorated(dataType)) {
              const location = (dataType.attribs as d.AnyAttribute[]).find(
                (a) => a.type === '@location',
              )?.params[0];
              this.ctx.addDeclaration(`layout(location = ${location}) out ${varName};`);
            }
          }
        }
        return `void main() ${body}`;
      }

      const argList = options.args
        // Stripping out unused arguments in entry functions
        .filter((arg) => arg.used || options.functionType === 'normal')
        .map((arg) => {
          return `${this.ctx.resolve(arg.decoratedType).value} ${arg.name}`;
        })
        .join(', ');

      return `${this.ctx.resolve(returnType).value} ${options.name}(${argList}) ${body}`;
    } finally {
      this.#functionType = lastFunctionType;
      this.#entryFnState = undefined;
    }
  }
}

const glslGenerator: GlslGenerator = new GlslGenerator();
export default glslGenerator;

import { d, ShaderGenerator, WgslGenerator } from 'typegpu';

// ----------
// WGSL → GLSL type name mapping
// ----------

const WGSL_TO_GLSL_TYPE: Record<string, string> = {
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
 * A GLSL ES 3.0 shader generator that extends WgslGenerator.
 * Overrides `dataType` to emit GLSL type names instead of WGSL ones,
 * and overrides variable declaration emission to use `type name = rhs` syntax.
 */
export class GlslGenerator extends WgslGenerator {
  public override typeAnnotation(data: d.BaseData): string {
    // For WGSL identity types (scalars, vectors, common matrices), map to GLSL directly.
    if (!d.isLooseData(data)) {
      const glslName = WGSL_TO_GLSL_TYPE[data.type];
      if (glslName !== undefined) {
        return glslName;
      }
    }

    // For all other types (structs, arrays, etc.) delegate to WGSL resolution.
    return super.typeAnnotation(data);
  }

  protected override emitVarDecl(
    pre: string,
    _keyword: 'var' | 'let' | 'const',
    name: string,
    dataType: d.BaseData | ShaderGenerator.UnknownData,
    rhsStr: string,
  ): string {
    const glslTypeName =
      dataType !== ShaderGenerator.UnknownData ? this.typeAnnotation(dataType) : 'auto';
    return `${pre}${glslTypeName} ${name} = ${rhsStr};`;
  }
}

const glslGenerator: GlslGenerator = new GlslGenerator();
export default glslGenerator;

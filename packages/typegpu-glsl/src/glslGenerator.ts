import type * as tinyest from 'tinyest';
import { type ShaderGenerator, type Snippet, WgslGenerator } from 'typegpu';
import type { AnyData } from 'typegpu/data';

const wgslToGlslTypeMap = {
  f32: 'float',
  f64: 'double',
  i32: 'int',
  u32: 'uint',
  void: 'void',
};

function resolveSchema(
  ctx: ShaderGenerator.ResolutionCtx,
  schema: AnyData,
): { typePrefix: string; typeSuffix: string } {
  if (schema.type in wgslToGlslTypeMap) {
    return {
      typePrefix:
        wgslToGlslTypeMap[schema.type as keyof typeof wgslToGlslTypeMap],
      typeSuffix: '',
    };
  }

  if (schema.type === 'array') {
    return {
      typePrefix: resolveSchema(ctx, schema.elementType as AnyData).typePrefix,
      typeSuffix: `[${schema.length}]`,
    };
  }

  // TODO: Make struct declaration the responsibility of the
  //       shader generator
  // if (schema.type === 'struct') {
  //   ctx.addDeclaration();

  //   const fields = schema.fields.map((field) =>
  //     `${resolveSchema(ctx, field.type).typePrefix} ${field.name}`
  //   ).join(', ');
  //   return {
  //     typePrefix: `struct ${structName} { ${fields} }`,
  //     typeSuffix: '',
  //   };
  // }

  throw new Error(`Unsupported type: ${String(schema)}`);
}

export class GLSLShaderGenerator extends WgslGenerator
  implements ShaderGenerator {
  public override expression(expression: tinyest.Expression): Snippet {
    return super.expression(expression);
  }

  public override functionHeader(
    { type, args, id, returnType }: ShaderGenerator.FunctionHeaderOptions,
  ): string {
    if (type === 'compute') {
      throw new Error('Compute shaders are not supported in GLSL');
    }

    const argList = args.map((arg) => {
      const segment = resolveSchema(this.ctx, arg.dataType as AnyData);
      return `${segment.typePrefix} ${arg.value}${segment.typeSuffix}`;
    }).join(', ');

    const returnSegment = resolveSchema(this.ctx, returnType);

    if (returnSegment.typeSuffix.length > 0) {
      throw new Error(`Unsupported return type: ${String(returnType)}`);
    }

    // Entry functions are always named 'main' in GLSL
    const realId = type === 'normal' ? id : 'main';

    return `${returnSegment.typePrefix} ${realId}(${argList})`;
  }
}

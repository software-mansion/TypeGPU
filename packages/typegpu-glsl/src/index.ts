import { type ShaderGenerator, type Snippet, WgslGenerator } from 'typegpu';
import type * as tinyest from 'tinyest';

export class GLSLShaderGenerator extends WgslGenerator
  implements ShaderGenerator {
  public override expression(expression: tinyest.Expression): Snippet {
    return super.expression(expression);
  }

  public override functionDefinition(body: tinyest.Block): string {
    return 'hello';
  }
}

import {
  type MirroredValue,
  type UniformValue,
  useRender,
} from '@typegpu/react';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { Model } from './load-model.ts';
import {
  ModelFragmentInput,
  ModelVertexInput,
  modelVertexLayout,
  ModelVertexOutput,
  type Uniforms,
} from './schemas.ts';

export function MonkeyRenderer({
  model,
  uniforms,
  modelColor,
}: {
  model: Model;
  uniforms: UniformValue<typeof Uniforms, d.Infer<typeof Uniforms>>;
  modelColor: MirroredValue<d.Vec3f>;
}) {
  const { ref } = useRender({
    vertexIn: ModelVertexInput,
    vertexOut: ModelVertexOutput,
    vertex: (input) => {
      'kernel';
      const worldPosition = std.mul(
        uniforms.$.modelMatrix,
        d.vec4f(input.modelPosition, 1.0),
      );
      const canvasPosition = std.mul(
        uniforms.$.viewProjectionMatrix,
        worldPosition,
      );

      const worldNormal = std.normalize(
        std.mul(uniforms.$.modelMatrix, d.vec4f(input.modelNormal, 0.0)).xyz,
      );

      return {
        canvasPosition: canvasPosition,
        worldNormal: worldNormal,
      };
    },
    fragmentIn: ModelFragmentInput,
    fragmentOut: d.vec4f,
    fragment: (input) => {
      'kernel';
      const lightDirection = std.normalize(d.vec3f(0.5, 0.5, -1.0));
      const ambientLight = 0.2;

      const diffuseStrength = std.max(
        std.dot(input.worldNormal, lightDirection),
        0.0,
      );
      const finalLight = ambientLight + diffuseStrength * (1.0 - ambientLight);
      const finalColor = std.mul(finalLight, modelColor.$);

      return d.vec4f(finalColor, 1.0);
    },
    vertexBuffer: model.vertexBuffer,
    vertexCount: model.polygonCount,
    vertexLayout: modelVertexLayout,
    depthTest: true,
  });

  return <canvas ref={ref} width='300' />;
}

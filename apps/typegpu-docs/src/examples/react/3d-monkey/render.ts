import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  bindGroupLayout,
  ModelVertexInput,
  ModelVertexOutput,
} from './schemas.ts';

export const vertexShader = tgpu['~unstable'].vertexFn({
  in: ModelVertexInput,
  out: ModelVertexOutput,
})((input) => {
  const worldPosition = std.mul(
    bindGroupLayout.$.uniforms.modelMatrix,
    d.vec4f(input.modelPosition, 1.0),
  );
  const canvasPosition = std.mul(
    bindGroupLayout.$.uniforms.viewProjectionMatrix,
    worldPosition,
  );

  const worldNormal = std.normalize(
    std.mul(
      bindGroupLayout.$.uniforms.modelMatrix,
      d.vec4f(input.modelNormal, 0.0),
    ).xyz,
  );

  return {
    canvasPosition: canvasPosition,
    worldNormal: worldNormal,
  };
});

export const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: ModelVertexOutput,
  out: d.vec4f,
})((input) => {
  const baseColor = d.vec3f(1.0, 0.5, 0.2); // monkey color - orange
  const lightDirection = std.normalize(d.vec3f(0.5, 0.5, -1.0));
  const ambientLight = 0.2;

  const diffuseStrength = std.max(
    std.dot(input.worldNormal, lightDirection),
    0.0,
  );
  const finalLight = ambientLight + diffuseStrength * (1.0 - ambientLight);
  const finalColor = std.mul(finalLight, baseColor);

  return d.vec4f(finalColor, 1.0);
});

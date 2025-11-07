import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { radiusOf } from './helpers.ts';
import {
  cameraAccess,
  filteringSamplerSlot,
  lightSourceAccess,
  renderBindGroupLayout as renderLayout,
  skyBoxAccess,
  VertexInput,
  VertexOutput,
} from './schemas.ts';

export const skyBoxVertex = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec3f,
    uv: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    texCoord: d.vec3f,
  },
})((input) => {
  const viewPos = std.mul(cameraAccess.$.view, d.vec4f(input.position, 0)).xyz;

  return {
    pos: std.mul(
      cameraAccess.$.projection,
      d.vec4f(viewPos, 1),
    ),
    texCoord: input.position.xyz,
  };
});

export const skyBoxFragment = tgpu['~unstable'].fragmentFn({
  in: {
    texCoord: d.vec3f,
  },
  out: d.vec4f,
})((input) =>
  std.textureSample(
    skyBoxAccess.$,
    filteringSamplerSlot.$,
    std.normalize(input.texCoord),
  )
);

export const mainVertex = tgpu['~unstable'].vertexFn({
  in: {
    ...VertexInput,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: VertexOutput,
})((input) => {
  const currentBody = renderLayout.$.celestialBodies[input.instanceIndex];

  const worldPosition = currentBody.position.add(
    input.position.xyz.mul(radiusOf(currentBody)),
  );

  const camera = cameraAccess.$;
  const positionOnCanvas = camera.projection
    .mul(camera.view)
    .mul(d.vec4f(worldPosition, 1));

  return {
    position: positionOnCanvas,
    uv: input.uv,
    normals: input.normal,
    worldPosition: worldPosition,
    sphereTextureIndex: currentBody.textureIndex,
    destroyed: currentBody.destroyed,
    ambientLightFactor: currentBody.ambientLightFactor,
  };
});

export const mainFragment = tgpu['~unstable'].fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => {
  if (input.destroyed === 1) {
    std.discard();
  }

  const lightColor = d.vec3f(1, 0.9, 0.9);
  const textureColor = std.textureSample(
    renderLayout.$.celestialBodyTextures,
    filteringSamplerSlot.$,
    input.uv,
    input.sphereTextureIndex,
  ).xyz;

  const ambient = textureColor.mul(lightColor).mul(input.ambientLightFactor);

  const normal = input.normals;
  const lightDirection = std.normalize(
    lightSourceAccess.$.sub(input.worldPosition),
  );
  const cosTheta = std.dot(normal, lightDirection);
  const diffuse = textureColor.mul(lightColor).mul(std.max(0, cosTheta));

  const litColor = ambient.add(diffuse);

  return d.vec4f(litColor.xyz, 1);
});

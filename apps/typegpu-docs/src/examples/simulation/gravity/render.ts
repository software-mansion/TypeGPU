import tgpu, { d, std } from 'typegpu';
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

export const skyBoxVertex = tgpu.vertexFn({
  in: {
    position: d.vec3f,
    uv: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    texCoord: d.vec3f,
  },
})((input) => {
  'use gpu';
  const viewPos = (cameraAccess.$.view * d.vec4f(input.position, 0)).xyz;

  return {
    pos: cameraAccess.$.projection * d.vec4f(viewPos, 1),
    texCoord: input.position.xyz,
  };
});

export const skyBoxFragment = tgpu.fragmentFn({
  in: {
    texCoord: d.vec3f,
  },
  out: d.vec4f,
})((input) =>
  std.textureSample(skyBoxAccess.$, filteringSamplerSlot.$, std.normalize(input.texCoord)),
);

export const mainVertex = tgpu.vertexFn({
  in: {
    ...VertexInput,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: VertexOutput,
})((input) => {
  'use gpu';
  const currentBody = renderLayout.$.celestialBodies[input.instanceIndex];

  const worldPosition = currentBody.position + input.position.xyz * radiusOf(currentBody);

  const camera = cameraAccess.$;
  const positionOnCanvas = camera.projection * camera.view * d.vec4f(worldPosition, 1);

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

export const mainFragment = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => {
  'use gpu';
  if (input.destroyed === 1) {
    std.discard();
  }

  const lightColor = d.vec3f(1, 0.9, 0.9);
  const textureColor = std.textureSample(
    renderLayout.$.celestialBodyTextures,
    filteringSamplerSlot.$,
    input.uv,
    input.sphereTextureIndex,
  ).rgb;

  const ambient = textureColor * lightColor * input.ambientLightFactor;

  const normal = input.normals;
  const lightDirection = std.normalize(lightSourceAccess.$ - input.worldPosition);
  const cosTheta = std.dot(normal, lightDirection);
  const diffuse = textureColor * lightColor * std.max(0, cosTheta);

  return d.vec4f(ambient + diffuse, 1);
});

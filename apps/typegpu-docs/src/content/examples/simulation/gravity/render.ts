import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { radiusOf } from './helpers.ts';
import {
  VertexOutput,
  renderBindGroupLayout as renderLayout,
  renderSkyBoxBindGroupLayout as skyBoxLayout,
} from './schemas.ts';

export const skyBoxVertex = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      uv: d.vec2f,
    },
    out: {
      pos: d.builtin.position,
      texCoord: d.vec3f,
    },
  })((input) => {
    const viewRotationMatrix = d.mat4x4f(
      skyBoxLayout.$.camera.view.columns[0],
      skyBoxLayout.$.camera.view.columns[1],
      skyBoxLayout.$.camera.view.columns[2],
      d.vec4f(0, 0, 0, 1),
    );
    return {
      pos: std.mul(
        skyBoxLayout.$.camera.projection,
        std.mul(viewRotationMatrix, input.position),
      ),
      texCoord: input.position.xyz,
    };
  })
  .$name('skybox');

export const skyBoxFragment = tgpu['~unstable']
  .fragmentFn({
    in: {
      texCoord: d.vec3f,
    },
    out: d.vec4f,
  })((input) => {
    return std.textureSample(
      skyBoxLayout.$.skyBox,
      skyBoxLayout.$.sampler,
      std.normalize(input.texCoord),
    );
  })
  .$name('skybox');

export const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      normal: d.vec3f,
      uv: d.vec2f,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: VertexOutput,
  })((input) => {
    const currentBody = renderLayout.$.celestialBodies[input.instanceIndex];

    const inputPosition = std.mul(1 / input.position.w, input.position.xyz);
    const worldPosition = std.add(
      std.mul(radiusOf(currentBody), inputPosition),
      currentBody.position,
    );

    const camera = renderLayout.$.camera;
    const positionOnCanvas = std.mul(
      camera.projection,
      std.mul(camera.view, d.vec4f(worldPosition, 1)),
    );
    return {
      position: positionOnCanvas,
      uv: input.uv,
      normals: input.normal,
      worldPosition: worldPosition,
      sphereTextureIndex: currentBody.textureIndex,
      destroyed: currentBody.destroyed,
      ambientLightFactor: currentBody.ambientLightFactor,
    };
  })
  .$name('celestial bodies');

export const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })((input) => {
    if (input.destroyed === 1) {
      std.discard();
    }

    const lightColor = d.vec3f(1, 0.9, 0.9);
    const lightSource = renderLayout.$.lightSource;
    const textureColor = std.textureSample(
      renderLayout.$.celestialBodyTextures,
      renderLayout.$.sampler,
      input.uv,
      input.sphereTextureIndex,
    ).xyz;

    const ambient = std.mul(
      input.ambientLightFactor,
      std.mul(textureColor, lightColor),
    );

    const normal = input.normals;
    const lightDirection = std.normalize(
      std.sub(lightSource, input.worldPosition),
    );
    const cosTheta = std.dot(normal, lightDirection);
    const diffuse = std.mul(
      std.max(0, cosTheta),
      std.mul(textureColor, lightColor),
    );

    const lightedColor = std.add(ambient, diffuse);

    return d.vec4f(lightedColor.xyz, 1);
  })
  .$name('celestial bodies');

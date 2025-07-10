import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { radiusOf } from './helpers.ts';
import {
  CelestialBody,
  renderBindGroupLayout as renderLayout,
  renderSkyBoxBindGroupLayout as skyBoxLayout,
  VertexOutput,
} from './schemas.ts';

export const skyBoxVertex = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec3f,
      uv: d.vec2f,
    },
    out: {
      pos: d.builtin.position,
      texCoord: d.vec3f,
    },
  })((input) => {
    const viewPos =
      std.mul(skyBoxLayout.$.camera.view, d.vec4f(input.position, 0)).xyz;

    return {
      pos: std.mul(
        skyBoxLayout.$.camera.projection,
        d.vec4f(viewPos, 1),
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
  })((input) =>
    std.textureSample(
      skyBoxLayout.$.skyBox,
      skyBoxLayout.$.sampler,
      std.normalize(input.texCoord),
    )
  )
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
    // TODO: replace it with struct copy when Chromium is fixed
    const currentBody = CelestialBody({
      position: renderLayout.$.celestialBodies[input.instanceIndex].position,
      velocity: renderLayout.$.celestialBodies[input.instanceIndex].velocity,
      mass: renderLayout.$.celestialBodies[input.instanceIndex].mass,
      collisionBehavior:
        renderLayout.$.celestialBodies[input.instanceIndex].collisionBehavior,
      textureIndex:
        renderLayout.$.celestialBodies[input.instanceIndex].textureIndex,
      radiusMultiplier:
        renderLayout.$.celestialBodies[input.instanceIndex].radiusMultiplier,
      ambientLightFactor:
        renderLayout.$.celestialBodies[input.instanceIndex].ambientLightFactor,
      destroyed: renderLayout.$.celestialBodies[input.instanceIndex].destroyed,
    });

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

    const litColor = std.add(ambient, diffuse);

    return d.vec4f(litColor.xyz, 1);
  })
  .$name('celestial bodies');

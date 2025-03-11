import * as std from 'typegpu/std';
import {
  ModelVertexInput,
  ModelVertexOutput,
  renderBindGroupLayout,
} from './schemas';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as p from './params';
import { distance, hsvToRgb, reflect, rgbToHsv } from './tgsl-helpers';

const {
  camera: renderCamera,
  modelTexture: renderModelTexture,
  sampler: renderSampler,
  modelData: renderModelData,
} = renderBindGroupLayout.bound;

export const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: ModelVertexInput,
    out: ModelVertexOutput,
  })
  .does((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const modelData = renderModelData.value[input.instanceIndex];

    const modelPosition = input.modelPosition;

    const direction = std.normalize(modelData.direction);

    const yaw = std.atan2(direction.z, direction.x) + Math.PI;
    // biome-ignore format:
    const yawMatrix = d.mat3x3f(
          std.cos(yaw),  0, std.sin(yaw),
          0,             1, 0,           
          -std.sin(yaw), 0, std.cos(yaw),
        );

    const pitch = -std.asin(-direction.y);
    // biome-ignore format:
    const pitchMatrix = d.mat3x3f(
          std.cos(pitch), -std.sin(pitch), 0,
          std.sin(pitch), std.cos(pitch),  0,
          0,              0,               1,
        );

    const worldPosition = std.add(
      std.mul(
        yawMatrix,
        std.mul(pitchMatrix, std.mul(modelData.scale, modelPosition)),
      ),
      modelData.position,
    );

    // calculate where the normal vector points to
    const worldNormal = std.normalize(
      std.mul(pitchMatrix, std.mul(yawMatrix, input.modelNormal)),
    );

    // project the world position into the camera
    const worldPositionUniform = d.vec4f(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z,
      1,
    );
    const canvasPosition = std.mul(
      renderCamera.value.projection,
      std.mul(renderCamera.value.view, worldPositionUniform),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal,
      worldPosition: worldPosition,
      applySeaFog: renderModelData.value[input.instanceIndex].applySeaFog,
      applySeaDesaturation:
        renderModelData.value[input.instanceIndex].applySeaDesaturation,
    };
  });

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
      return textureSample(shaderTexture, shaderSampler, uv);
    }`)
  .$uses({ shaderTexture: renderModelTexture, shaderSampler: renderSampler })
  .$name('sampleShader');

export const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: ModelVertexOutput,
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    // shade the fragment in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model
    // then apply sea fog and sea blindness

    const viewDirection = std.normalize(
      std.sub(renderCamera.value.position.xyz, input.worldPosition),
    );
    const textureColorWithAlpha = sampleTexture(input.textureUV); // base color
    const textureColor = textureColorWithAlpha.xyz;

    let ambient = d.vec3f();
    let diffuse = d.vec3f();
    let specular = d.vec3f();

    ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

    const cosTheta = std.max(0.0, std.dot(input.worldNormal, p.lightDirection));
    if (cosTheta > 0) {
      diffuse = std.mul(cosTheta, std.mul(textureColor, p.lightColor));

      const reflectionDirection = reflect(
        std.mul(-1, p.lightDirection),
        input.worldNormal,
      );

      specular = std.mul(
        0.5,
        std.mul(
          textureColor,
          std.mul(std.dot(reflectionDirection, viewDirection), p.lightColor),
        ),
      );
    }

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    const distanceFromCamera = distance(
      renderCamera.value.position.xyz,
      input.worldPosition,
    );

    let blindedColor = lightedColor;
    if (input.applySeaDesaturation === 1) {
      const blindedParameter = (distanceFromCamera - 5) / 10;
      const blindedFactor = -std.atan2(blindedParameter, 1) / 3;
      const hsv = rgbToHsv(blindedColor);
      hsv.z += blindedFactor;
      blindedColor = hsvToRgb(hsv);
    }

    let foggedColor = blindedColor;
    if (input.applySeaFog === 1) {
      const fogParameter = std.max(0, (distanceFromCamera - 1.5) * 0.2);
      const fogFactor = fogParameter / (1 + fogParameter);
      foggedColor = std.mix(foggedColor, p.backgroundColor, fogFactor);
    }

    return d.vec4f(foggedColor.xyz, 1);
  })
  .$name('mainFragment');

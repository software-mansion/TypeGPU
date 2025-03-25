import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params';
import {
  ModelVertexInput,
  ModelVertexOutput,
  renderBindGroupLayout,
} from './schemas';
import { hsvToRgb, rgbToHsv } from './tgsl-helpers';

const { camera, modelTexture, sampler, modelData, currentTime } =
  renderBindGroupLayout.bound;

const ApplySinWaveReturnSchema = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

const applySinWave = tgpu['~unstable']
  .fn([d.u32, d.vec3f, d.vec3f], ApplySinWaveReturnSchema)
  .does((time, position, normal) => {
    const timeFactor = d.f32(time) / 1000;

    const positionModification = d.vec3f(
      0,
      0,
      std.sin(timeFactor + position.x),
    );

    const modelNormal = normal;
    const normalXZ = d.vec3f(modelNormal.x, 0, modelNormal.z);

    // const coeff = d.f32(0);
    const coeff = std.cos(timeFactor + position.x);
    const newOX = std.normalize(d.vec3f(1, 0, coeff));
    let newOZ = d.vec3f(-newOX.z, 0, newOX.x);
    // if (std.dot(newOZ, normal) < 0) {
    //   newOZ = std.mul(-1, newOZ);
    // }
    const newNormalXZ = std.add(
      std.mul(newOX, d.vec3f(normalXZ.x, 0, 0)),
      std.mul(newOZ, d.vec3f(0, 0, normalXZ.z)),
    );

    const wavedNormal = std.normalize(
      d.vec3f(newNormalXZ.x, modelNormal.y, newNormalXZ.z),
    );

    const wavedPosition = std.add(position, positionModification);

    return ApplySinWaveReturnSchema({
      position: wavedPosition,
      normal: wavedNormal,
    });
  });

export const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: { ...ModelVertexInput, instanceIndex: d.builtin.instanceIndex },
    out: ModelVertexOutput,
  })
  .does((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const currentModelData = modelData.value[input.instanceIndex];

    // apply sin wave

    // const wavedResults = applySinWave(
    //   currentTime.value,
    //   input.modelPosition,
    //   input.modelNormal,
    // );
    // const wavedPosition = wavedResults.position;
    // const wavedNormal = wavedResults.normal;

    const wavedPosition = input.modelPosition;
    const wavedNormal = input.modelNormal;

    // rotate model

    const direction = std.normalize(currentModelData.direction);

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
        std.mul(pitchMatrix, std.mul(currentModelData.scale, wavedPosition)),
      ),
      currentModelData.position,
    );

    // calculate where the normal vector points to
    const worldNormal = std.normalize(
      std.mul(pitchMatrix, std.mul(yawMatrix, wavedNormal)),
    );

    // project the world position into the camera
    const worldPositionUniform = d.vec4f(worldPosition.xyz, 1);
    const canvasPosition = std.mul(
      camera.value.projection,
      std.mul(camera.value.view, worldPositionUniform),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal,
      worldPosition: worldPosition,
      applySeaFog: currentModelData.applySeaFog,
      applySeaDesaturation: currentModelData.applySeaDesaturation,
    };
  })
  .$name('vertex shader');

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/* wgsl */ `(uv: vec2f) -> vec4f {
    return textureSample(shaderTexture, shaderSampler, uv);
  }`)
  .$uses({ shaderTexture: modelTexture, shaderSampler: sampler })
  .$name('sampleShader');

export const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: ModelVertexOutput,
    out: d.vec4f,
  })
  .does((input) => {
    // shade the fragment in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model
    // then apply sea fog and sea desaturation

    const textureColorWithAlpha = sampleTexture(input.textureUV); // base color
    const textureColor = textureColorWithAlpha.xyz;

    const ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

    const cosTheta = std.dot(input.worldNormal, p.lightDirection);
    const diffuse = std.mul(
      std.max(0, cosTheta),
      std.mul(textureColor, p.lightColor),
    );

    const viewSource = std.normalize(
      std.sub(camera.value.position.xyz, input.worldPosition),
    );
    const reflectSource = std.normalize(
      std.reflect(std.mul(-1, p.lightDirection), input.worldNormal),
    );
    const specularStrength = std.pow(
      std.max(0, std.dot(viewSource, reflectSource)),
      16,
    );
    const specular = std.mul(specularStrength, p.lightColor);

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    // apply desaturation
    const distanceFromCamera = std.length(
      std.sub(camera.value.position.xyz, input.worldPosition),
    );

    let desaturatedColor = lightedColor;
    if (input.applySeaDesaturation === 1) {
      const desaturationFactor =
        -std.atan2((distanceFromCamera - 5) / 10, 1) / 3;
      const hsv = rgbToHsv(desaturatedColor);
      hsv.y += desaturationFactor / 2;
      hsv.z += desaturationFactor;
      desaturatedColor = hsvToRgb(hsv);
    }

    let foggedColor = desaturatedColor;
    if (input.applySeaFog === 1) {
      const fogParameter = std.max(0, (distanceFromCamera - 1.5) * 0.2);
      const fogFactor = fogParameter / (1 + fogParameter);
      foggedColor = std.mix(foggedColor, p.backgroundColor, fogFactor);
    }

    return d.vec4f(foggedColor.xyz, 1);
  })
  .$name('fragment shader');

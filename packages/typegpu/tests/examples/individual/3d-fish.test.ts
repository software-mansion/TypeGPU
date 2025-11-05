/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('3d fish example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: '3d-fish',
      setupMocks: () => {
        mockResizeObserver();
        mock3DModelLoading();
      },
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<uniform> seedUniform_3: f32;

      var<private> seed_6: vec2f;

      fn seed2_5(value: vec2f) {
        seed_6 = value;
      }

      fn randSeed2_4(seed: vec2f) {
        seed2_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168f));
        seed_6.y = fract((cos(b) * 534.7645f));
        return seed_6.y;
      }

      fn randFloat01_7() -> f32 {
        return item_8();
      }

      struct ModelData_9 {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(2) var<storage, read_write> fish_data_0_10: array<ModelData_9, 8192>;

      @group(0) @binding(3) var<storage, read_write> fish_data_1_11: array<ModelData_9, 8192>;

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed2_4(vec2f(f32(x), seedUniform_3));
        var data = ModelData_9(vec3f(((randFloat01_7() * 10f) - 5f), ((randFloat01_7() * 4f) - 2f), ((randFloat01_7() * 10f) - 5f)), vec3f(((randFloat01_7() * 0.1f) - 0.05f), ((randFloat01_7() * 0.1f) - 0.05f), ((randFloat01_7() * 0.1f) - 0.05f)), (0.07f * (1f + ((randFloat01_7() - 0.5f) * 0.8f))), randFloat01_7(), 1u, 1u, 1u);
        fish_data_0_10[x] = data;
        fish_data_1_11[x] = data;
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      struct ModelData_4 {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(1) @binding(0) var<storage, read> currentFishData_3: array<ModelData_4>;

      struct FishBehaviorParams_6 {
        separationDist: f32,
        separationStr: f32,
        alignmentDist: f32,
        alignmentStr: f32,
        cohesionDist: f32,
        cohesionStr: f32,
      }

      @group(1) @binding(4) var<uniform> fishBehavior_5: FishBehaviorParams_6;

      struct Line3_9 {
        origin: vec3f,
        dir: vec3f,
      }

      struct MouseRay_8 {
        activated: u32,
        line: Line3_9,
      }

      @group(1) @binding(2) var<uniform> mouseRay_7: MouseRay_8;

      fn projectPointOnLine_10(point: vec3f, line: Line3_9) -> vec3f {
        var pointVector = (point - line.origin);
        var projection = dot(pointVector, line.dir);
        return (line.origin + (line.dir * projection));
      }

      @group(1) @binding(3) var<uniform> timePassed_11: f32;

      @group(1) @binding(1) var<storage, read_write> nextFishData_12: array<ModelData_4>;

      fn simulate_2(fishIndex: u32, _arg_1: u32, _arg_2: u32) {
        var fishData = ModelData_4(currentFishData_3[fishIndex].position, currentFishData_3[fishIndex].direction, currentFishData_3[fishIndex].scale, currentFishData_3[fishIndex].variant, currentFishData_3[fishIndex].applySinWave, currentFishData_3[fishIndex].applySeaFog, currentFishData_3[fishIndex].applySeaDesaturation);
        var separation = vec3f();
        var alignment = vec3f();
        var alignmentCount = 0;
        var cohesion = vec3f();
        var cohesionCount = 0;
        var wallRepulsion = vec3f();
        var rayRepulsion = vec3f();
        for (var i = 0; (i < 8192i); i += 1i) {
          if ((u32(i) == fishIndex)) {
            continue;
          }
          var other = ModelData_4(currentFishData_3[i].position, currentFishData_3[i].direction, currentFishData_3[i].scale, currentFishData_3[i].variant, currentFishData_3[i].applySinWave, currentFishData_3[i].applySeaFog, currentFishData_3[i].applySeaDesaturation);
          var dist = length((fishData.position - other.position));
          if ((dist < fishBehavior_5.separationDist)) {
            separation = (separation + (fishData.position - other.position));
          }
          if ((dist < fishBehavior_5.alignmentDist)) {
            alignment = (alignment + other.direction);
            alignmentCount = (alignmentCount + 1i);
          }
          if ((dist < fishBehavior_5.cohesionDist)) {
            cohesion = (cohesion + other.position);
            cohesionCount = (cohesionCount + 1i);
          }
        }
        if ((alignmentCount > 0i)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0i)) {
          cohesion = (((1f / f32(cohesionCount)) * cohesion) - fishData.position);
        }
        for (var i = 0; (i < 3i); i += 1i) {
          var repulsion = vec3f();
          repulsion[i] = 1f;
          var axisAquariumSize = (vec3f(10, 4, 10)[i] / 2f);
          var axisPosition = fishData.position[i];
          var distance = 0.1;
          if ((axisPosition > (axisAquariumSize - distance))) {
            var str = (axisPosition - (axisAquariumSize - distance));
            wallRepulsion = (wallRepulsion - (str * repulsion));
          }
          if ((axisPosition < (-axisAquariumSize + distance))) {
            var str = ((-axisAquariumSize + distance) - axisPosition);
            wallRepulsion = (wallRepulsion + (str * repulsion));
          }
        }
        if ((mouseRay_7.activated == 1u)) {
          var proj = projectPointOnLine_10(fishData.position, mouseRay_7.line);
          var diff = (fishData.position - proj);
          var limit = 0.9;
          var str = (pow(2f, clamp((limit - length(diff)), 0f, limit)) - 1f);
          rayRepulsion = (str * normalize(diff));
        }
        fishData.direction = (fishData.direction + (fishBehavior_5.separationStr * separation));
        fishData.direction = (fishData.direction + (fishBehavior_5.alignmentStr * alignment));
        fishData.direction = (fishData.direction + (fishBehavior_5.cohesionStr * cohesion));
        fishData.direction = (fishData.direction + (1e-4 * wallRepulsion));
        fishData.direction = (fishData.direction + (5e-4 * rayRepulsion));
        fishData.direction = (clamp(length(fishData.direction), 0f, 0.01f) * normalize(fishData.direction));
        var translation = ((min(999f, timePassed_11) / 8f) * fishData.direction);
        fishData.position = (fishData.position + translation);
        nextFishData_12[fishIndex] = fishData;
      }

      struct mainCompute_Input_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_13)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        simulate_2(in.id.x, in.id.y, in.id.z);
      }

      struct ModelData_2 {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(0) var<storage, read> modelData_1: array<ModelData_2>;

      struct PosAndNormal_3 {
        position: vec3f,
        normal: vec3f,
      }

      fn applySinWave_4(index: u32, vertex: PosAndNormal_3, time: f32) -> PosAndNormal_3 {
        var a = -60.1;
        var b = 0.8;
        var c = 6.1;
        var posMod = vec3f();
        posMod.z = (sin((f32(index) + (((time / a) + vertex.position.x) / b))) / c);
        var coeff = (cos((f32(index) + (((time / a) + vertex.position.x) / b))) / c);
        var newOX = normalize(vec3f(1f, 0f, coeff));
        var newOZ = vec3f(-newOX.z, 0f, newOX.x);
        var newNormalXZ = ((newOX * vertex.normal.x) + (newOZ * vertex.normal.z));
        var wavedNormal = vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
        var wavedPosition = (vertex.position + posMod);
        return PosAndNormal_3(wavedPosition, wavedNormal);
      }

      @group(0) @binding(4) var<uniform> currentTime_5: f32;

      struct Camera_7 {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> camera_6: Camera_7;

      struct vertexShader_Output_8 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      struct vertexShader_Input_9 {
        @location(0) modelPosition: vec3f,
        @location(1) modelNormal: vec3f,
        @location(2) textureUV: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn vertexShader_0(input: vertexShader_Input_9) -> vertexShader_Output_8 {
        var currentModelData = ModelData_2(modelData_1[input.instanceIndex].position, modelData_1[input.instanceIndex].direction, modelData_1[input.instanceIndex].scale, modelData_1[input.instanceIndex].variant, modelData_1[input.instanceIndex].applySinWave, modelData_1[input.instanceIndex].applySeaFog, modelData_1[input.instanceIndex].applySeaDesaturation);
        var wavedVertex = PosAndNormal_3(input.modelPosition, input.modelNormal);
        if ((currentModelData.applySinWave == 1u)) {
          wavedVertex = applySinWave_4(input.instanceIndex, PosAndNormal_3(input.modelPosition, input.modelNormal), currentTime_5);
        }
        var direction = normalize(currentModelData.direction);
        var yaw = (-atan2(direction.z, direction.x) + 3.141592653589793f);
        var pitch = asin(-direction.y);
        var scaleMatrix = mat4x4f(vec3f(currentModelData.scale).x, 0, 0, 0, 0, vec3f(currentModelData.scale).y, 0, 0, 0, 0, vec3f(currentModelData.scale).z, 0, 0, 0, 0, 1);
        var pitchMatrix = mat4x4f(cos(pitch), sin(pitch), 0, 0, -sin(pitch), cos(pitch), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        var yawMatrix = mat4x4f(cos(yaw), 0, -sin(yaw), 0, 0, 1, 0, 0, sin(yaw), 0, cos(yaw), 0, 0, 0, 0, 1);
        var translationMatrix = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, currentModelData.position.x, currentModelData.position.y, currentModelData.position.z, 1);
        var worldPosition = (translationMatrix * (yawMatrix * (pitchMatrix * (scaleMatrix * vec4f(wavedVertex.position, 1f)))));
        var worldNormal = normalize((yawMatrix * (pitchMatrix * vec4f(wavedVertex.normal, 1f))).xyz);
        var worldPositionUniform = worldPosition;
        var canvasPosition = (camera_6.projection * (camera_6.view * worldPositionUniform));
        return vertexShader_Output_8(worldPosition.xyz, worldNormal, canvasPosition, currentModelData.variant, input.textureUV, currentModelData.applySeaFog, currentModelData.applySeaDesaturation);
      }

      @group(0) @binding(1) var modelTexture_11: texture_2d<f32>;

      @group(0) @binding(3) var sampler_12: sampler;

      fn rgbToHsv_13(rgb: vec3f) -> vec3f {
        var r = rgb.x;
        var g = rgb.y;
        var b = rgb.z;
        var maxC = max(r, max(g, b));
        var minC = min(r, min(g, b));
        var delta = (maxC - minC);
        var h = 0f;
        var s = 0f;
        if ((maxC == 0f)) {
          s = 0f;
        }
        else {
          s = (delta / maxC);
        }
        var v = maxC;
        if ((maxC == minC)) {
          h = 0f;
        }
        else {
          if ((maxC == r)) {
            var cond = 0f;
            if ((g < b)) {
              cond = 6f;
            }
            else {
              cond = 0f;
            }
            h = ((g - b) + (delta * cond));
            h /= (6f * delta);
          }
          else {
            if ((maxC == g)) {
              h = ((b - r) + (delta * 2f));
              h /= (6f * delta);
            }
            else {
              if ((maxC == b)) {
                h = ((r - g) + (delta * 4f));
                h /= (6f * delta);
              }
            }
          }
        }
        return vec3f(h, s, v);
      }

      fn hsvToRgb_14(hsv: vec3f) -> vec3f {
        var h = hsv.x;
        var s = hsv.y;
        var v = hsv.z;
        var i = floor((h * 6f));
        var f = ((h * 6f) - i);
        var p = (v * (1f - s));
        var q = (v * (1f - (f * s)));
        var t = (v * (1f - ((1f - f) * s)));
        var r = 0f;
        var g = 0f;
        var b = 0f;
        if (((i % 6f) == 0f)) {
          r = v;
          g = t;
          b = p;
        }
        else {
          if (((i % 6f) == 1f)) {
            r = q;
            g = v;
            b = p;
          }
          else {
            if (((i % 6f) == 2f)) {
              r = p;
              g = v;
              b = t;
            }
            else {
              if (((i % 6f) == 3f)) {
                r = p;
                g = q;
                b = v;
              }
              else {
                if (((i % 6f) == 4f)) {
                  r = t;
                  g = p;
                  b = v;
                }
                else {
                  r = v;
                  g = p;
                  b = q;
                }
              }
            }
          }
        }
        return vec3f(r, g, b);
      }

      struct fragmentShader_Input_15 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      @fragment fn fragmentShader_10(input: fragmentShader_Input_15) -> @location(0) vec4f {
        var textureColorWithAlpha = textureSample(modelTexture_11, sampler_12, input.textureUV);
        var textureColor = textureColorWithAlpha.xyz;
        var ambient = (0.5 * (textureColor * vec3f(0.800000011920929, 0.800000011920929, 1)));
        var cosTheta = dot(input.worldNormal, vec3f(-0.2357022613286972, 0.9428090453147888, -0.2357022613286972));
        var diffuse = (max(0f, cosTheta) * (textureColor * vec3f(0.800000011920929, 0.800000011920929, 1)));
        var viewSource = normalize((camera_6.position.xyz - input.worldPosition));
        var reflectSource = normalize(reflect((-1 * vec3f(-0.2357022613286972, 0.9428090453147888, -0.2357022613286972)), input.worldNormal));
        var specularStrength = pow(max(0f, dot(viewSource, reflectSource)), 16f);
        var specular = (specularStrength * vec3f(0.800000011920929, 0.800000011920929, 1));
        var lightedColor = (ambient + (diffuse + specular));
        var distanceFromCamera = length((camera_6.position.xyz - input.worldPosition));
        var desaturatedColor = lightedColor;
        if ((input.applySeaDesaturation == 1u)) {
          var desaturationFactor = (-atan2(((distanceFromCamera - 5f) / 10f), 1f) / 3f);
          var hsv = rgbToHsv_13(desaturatedColor);
          hsv.y += (desaturationFactor / 2f);
          hsv.z += desaturationFactor;
          hsv.x += ((input.variant - 0.5f) * 0.2f);
          desaturatedColor = hsvToRgb_14(hsv);
        }
        var foggedColor = desaturatedColor;
        if ((input.applySeaFog == 1u)) {
          var fogParameter = max(0f, ((distanceFromCamera - 1.5f) * 0.2f));
          var fogFactor = (fogParameter / (1f + fogParameter));
          foggedColor = mix(foggedColor, vec3f(0, 0.47843137383461, 0.800000011920929), fogFactor);
        }
        return vec4f(foggedColor.xyz, 1f);
      }"
    `);
  });
});

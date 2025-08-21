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
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct computeShader_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct ModelData_3 {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(0) var<storage, read> currentFishData_2: array<ModelData_3>;

      struct FishBehaviorParams_5 {
        separationDist: f32,
        separationStr: f32,
        alignmentDist: f32,
        alignmentStr: f32,
        cohesionDist: f32,
        cohesionStr: f32,
      }

      @group(0) @binding(4) var<uniform> fishBehavior_4: FishBehaviorParams_5;

      struct Line3_8 {
        origin: vec3f,
        dir: vec3f,
      }

      struct MouseRay_7 {
        activated: u32,
        line: Line3_8,
      }

      @group(0) @binding(2) var<uniform> mouseRay_6: MouseRay_7;

      fn projectPointOnLine_9(point: vec3f, line: Line3_8) -> vec3f {
        var pointVector = (point - line.origin);
        var projection = dot(pointVector, line.dir);
        var closestPoint = (line.origin + (projection * line.dir));
        return closestPoint;
      }

      @group(0) @binding(3) var<uniform> timePassed_10: f32;

      @group(0) @binding(1) var<storage, read_write> nextFishData_11: array<ModelData_3>;

      @compute @workgroup_size(256) fn computeShader_0(input: computeShader_Input_1) {
        var fishIndex = input.gid.x;
        var fishData = ModelData_3(currentFishData_2[fishIndex].position, currentFishData_2[fishIndex].direction, currentFishData_2[fishIndex].scale, currentFishData_2[fishIndex].variant, currentFishData_2[fishIndex].applySinWave, currentFishData_2[fishIndex].applySeaFog, currentFishData_2[fishIndex].applySeaDesaturation);
        var separation = vec3f();
        var alignment = vec3f();
        var alignmentCount = 0;
        var cohesion = vec3f();
        var cohesionCount = 0;
        var wallRepulsion = vec3f();
        var rayRepulsion = vec3f();
        for (var i = 0; (i < 8192); i += 1) {
          if ((u32(i) == fishIndex)) {
            continue;
          }
          var other = ModelData_3(currentFishData_2[i].position, currentFishData_2[i].direction, currentFishData_2[i].scale, currentFishData_2[i].variant, currentFishData_2[i].applySinWave, currentFishData_2[i].applySeaFog, currentFishData_2[i].applySeaDesaturation);
          var dist = length((fishData.position - other.position));
          if ((dist < fishBehavior_4.separationDist)) {
            separation = (separation + (fishData.position - other.position));
          }
          if ((dist < fishBehavior_4.alignmentDist)) {
            alignment = (alignment + other.direction);
            alignmentCount = (alignmentCount + 1);
          }
          if ((dist < fishBehavior_4.cohesionDist)) {
            cohesion = (cohesion + other.position);
            cohesionCount = (cohesionCount + 1);
          }
        }
        if ((alignmentCount > 0)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0)) {
          cohesion = (((1f / f32(cohesionCount)) * cohesion) - fishData.position);
        }
        for (var i = 0; (i < 3); i += 1) {
          var repulsion = vec3f();
          repulsion[i] = 1;
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
        if ((mouseRay_6.activated == 1)) {
          var proj = projectPointOnLine_9(fishData.position, mouseRay_6.line);
          var diff = (fishData.position - proj);
          var limit = 0.9;
          var str = (pow(2, clamp((limit - length(diff)), 0, limit)) - 1);
          rayRepulsion = (str * normalize(diff));
        }
        fishData.direction = (fishData.direction + (fishBehavior_4.separationStr * separation));
        fishData.direction = (fishData.direction + (fishBehavior_4.alignmentStr * alignment));
        fishData.direction = (fishData.direction + (fishBehavior_4.cohesionStr * cohesion));
        fishData.direction = (fishData.direction + (1e-4 * wallRepulsion));
        fishData.direction = (fishData.direction + (5e-4 * rayRepulsion));
        fishData.direction = (clamp(length(fishData.direction), 0, 0.01) * normalize(fishData.direction));
        var translation = ((min(999, timePassed_10) / 8f) * fishData.direction);
        fishData.position = (fishData.position + translation);
        nextFishData_11[fishIndex] = fishData;
      }

      struct vertexShader_Input_13 {
        @location(0) modelPosition: vec3f,
        @location(1) modelNormal: vec3f,
        @location(2) textureUV: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      struct vertexShader_Output_14 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      struct ModelData_16 {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(0) var<storage, read> modelData_15: array<ModelData_16>;

      struct PosAndNormal_17 {
        position: vec3f,
        normal: vec3f,
      }

      fn applySinWave_18(index: u32, vertex: PosAndNormal_17, time: f32) -> PosAndNormal_17 {
        var a = -60.1;
        var b = 0.8;
        var c = 6.1;
        var positionModification = vec3f(0, 0, (sin((f32(index) + (((time / a) + vertex.position.x) / b))) / c));
        var coeff = (cos((f32(index) + (((time / a) + vertex.position.x) / b))) / c);
        var newOX = normalize(vec3f(1, 0, coeff));
        var newOZ = vec3f(-newOX.z, 0, newOX.x);
        var newNormalXZ = ((vertex.normal.x * newOX) + (vertex.normal.z * newOZ));
        var wavedNormal = vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
        var wavedPosition = (vertex.position + positionModification);
        return PosAndNormal_17(wavedPosition, wavedNormal);
      }

      @group(0) @binding(4) var<uniform> currentTime_19: f32;

      struct Camera_21 {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> camera_20: Camera_21;

      @vertex fn vertexShader_12(input: vertexShader_Input_13) -> vertexShader_Output_14 {
        var currentModelData = ModelData_16(modelData_15[input.instanceIndex].position, modelData_15[input.instanceIndex].direction, modelData_15[input.instanceIndex].scale, modelData_15[input.instanceIndex].variant, modelData_15[input.instanceIndex].applySinWave, modelData_15[input.instanceIndex].applySeaFog, modelData_15[input.instanceIndex].applySeaDesaturation);
        var wavedVertex = PosAndNormal_17(input.modelPosition, input.modelNormal);
        if ((currentModelData.applySinWave == 1)) {
          wavedVertex = applySinWave_18(input.instanceIndex, PosAndNormal_17(input.modelPosition, input.modelNormal), currentTime_19);
        }
        var direction = normalize(currentModelData.direction);
        var yaw = (-atan2(direction.z, direction.x) + 3.141592653589793);
        var pitch = asin(-direction.y);
        var scaleMatrix = mat4x4f(vec3f(currentModelData.scale).x, 0, 0, 0, 0, vec3f(currentModelData.scale).y, 0, 0, 0, 0, vec3f(currentModelData.scale).z, 0, 0, 0, 0, 1);
        var pitchMatrix = mat4x4f(cos(pitch), sin(pitch), 0, 0, -sin(pitch), cos(pitch), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        var yawMatrix = mat4x4f(cos(yaw), 0, -sin(yaw), 0, 0, 1, 0, 0, sin(yaw), 0, cos(yaw), 0, 0, 0, 0, 1);
        var translationMatrix = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, currentModelData.position.x, currentModelData.position.y, currentModelData.position.z, 1);
        var worldPosition = (translationMatrix * (yawMatrix * (pitchMatrix * (scaleMatrix * vec4f(wavedVertex.position, 1)))));
        var worldNormal = normalize((yawMatrix * (pitchMatrix * vec4f(wavedVertex.normal, 1))).xyz);
        var worldPositionUniform = worldPosition;
        var canvasPosition = (camera_20.projection * (camera_20.view * worldPositionUniform));
        return vertexShader_Output_14(worldPosition.xyz, worldNormal, canvasPosition, currentModelData.variant, input.textureUV, currentModelData.applySeaFog, currentModelData.applySeaDesaturation);
      }

      struct fragmentShader_Input_23 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      @group(0) @binding(1) var modelTexture_25: texture_2d<f32>;

      @group(0) @binding(3) var sampler_26: sampler;

      fn sampleTexture_24(uv: vec2f) -> vec4f{
        return textureSample(modelTexture_25, sampler_26, uv);
      }


      fn rgbToHsv_27(rgb: vec3f) -> vec3f {
        var r = rgb.x;
        var g = rgb.y;
        var b = rgb.z;
        var maxC = max(r, max(g, b));
        var minC = min(r, min(g, b));
        var delta = (maxC - minC);
        var h = 0f;
        var s = 0f;
        if ((maxC == 0)) {
          s = 0;
        }
        else {
          s = (delta / maxC);
        }
        var v = maxC;
        if ((maxC == minC)) {
          h = 0;
        }
        else {
          if ((maxC == r)) {
            var cond = 0f;
            if ((g < b)) {
              cond = 6;
            }
            else {
              cond = 0;
            }
            h = ((g - b) + (delta * cond));
            h /= (6 * delta);
          }
          else {
            if ((maxC == g)) {
              h = ((b - r) + (delta * 2));
              h /= (6 * delta);
            }
            else {
              if ((maxC == b)) {
                h = ((r - g) + (delta * 4));
                h /= (6 * delta);
              }
            }
          }
        }
        return vec3f(h, s, v);
      }

      fn hsvToRgb_28(hsv: vec3f) -> vec3f {
        var h = hsv.x;
        var s = hsv.y;
        var v = hsv.z;
        var i = floor((h * 6));
        var f = ((h * 6) - i);
        var p = (v * (1 - s));
        var q = (v * (1 - (f * s)));
        var t = (v * (1 - ((1 - f) * s)));
        var r = 0f;
        var g = 0f;
        var b = 0f;
        if (((i % 6) == 0)) {
          r = v;
          g = t;
          b = p;
        }
        else {
          if (((i % 6) == 1)) {
            r = q;
            g = v;
            b = p;
          }
          else {
            if (((i % 6) == 2)) {
              r = p;
              g = v;
              b = t;
            }
            else {
              if (((i % 6) == 3)) {
                r = p;
                g = q;
                b = v;
              }
              else {
                if (((i % 6) == 4)) {
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

      @fragment fn fragmentShader_22(input: fragmentShader_Input_23) -> @location(0) vec4f {
        var textureColorWithAlpha = sampleTexture_24(input.textureUV);
        var textureColor = textureColorWithAlpha.xyz;
        var ambient = (0.5 * (textureColor * vec3f(0.800000011920929, 0.800000011920929, 1)));
        var cosTheta = dot(input.worldNormal, vec3f(-0.2357022613286972, 0.9428090453147888, -0.2357022613286972));
        var diffuse = (max(0, cosTheta) * (textureColor * vec3f(0.800000011920929, 0.800000011920929, 1)));
        var viewSource = normalize((camera_20.position.xyz - input.worldPosition));
        var reflectSource = normalize(reflect((-1 * vec3f(-0.2357022613286972, 0.9428090453147888, -0.2357022613286972)), input.worldNormal));
        var specularStrength = pow(max(0, dot(viewSource, reflectSource)), 16);
        var specular = (specularStrength * vec3f(0.800000011920929, 0.800000011920929, 1));
        var lightedColor = (ambient + (diffuse + specular));
        var distanceFromCamera = length((camera_20.position.xyz - input.worldPosition));
        var desaturatedColor = lightedColor;
        if ((input.applySeaDesaturation == 1)) {
          var desaturationFactor = (-atan2(((distanceFromCamera - 5) / 10f), 1) / 3f);
          var hsv = rgbToHsv_27(desaturatedColor);
          hsv.y += (desaturationFactor / 2f);
          hsv.z += desaturationFactor;
          hsv.x += ((input.variant - 0.5) * 0.2);
          desaturatedColor = hsvToRgb_28(hsv);
        }
        var foggedColor = desaturatedColor;
        if ((input.applySeaFog == 1)) {
          var fogParameter = max(0, ((distanceFromCamera - 1.5) * 0.2));
          var fogFactor = (fogParameter / (1 + fogParameter));
          foggedColor = mix(foggedColor, vec3f(0, 0.47843137383461, 0.800000011920929), fogFactor);
        }
        return vec4f(foggedColor.xyz, 1);
      }"
    `);
  });
});

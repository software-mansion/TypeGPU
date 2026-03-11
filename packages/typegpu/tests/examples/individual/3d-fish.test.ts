/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockCreateImageBitmap,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('3d fish example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: '3d-fish',
        setupMocks: () => {
          mockResizeObserver();
          mock3DModelLoading();
          mockCreateImageBitmap();
        },
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> seedUniform: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      struct ModelData {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(2) var<storage, read_write> fish_data_0: array<ModelData, 8192>;

      @group(0) @binding(3) var<storage, read_write> fish_data_1: array<ModelData, 8192>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed2(vec2f(f32(x), seedUniform));
        var data = ModelData(vec3f(((randFloat01() * 10f) - 5f), ((randFloat01() * 4f) - 2f), ((randFloat01() * 10f) - 5f)), vec3f(((randFloat01() * 0.1f) - 0.05f), ((randFloat01() * 0.1f) - 0.05f), ((randFloat01() * 0.1f) - 0.05f)), (0.07f * (1f + ((randFloat01() - 0.5f) * 0.8f))), randFloat01(), 1u, 1u, 1u);
        fish_data_0[x] = data;
        fish_data_1[x] = data;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct ModelData {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(1) @binding(0) var<storage, read> currentFishData: array<ModelData>;

      struct FishBehaviorParams {
        separationDist: f32,
        separationStr: f32,
        alignmentDist: f32,
        alignmentStr: f32,
        cohesionDist: f32,
        cohesionStr: f32,
      }

      @group(1) @binding(4) var<uniform> fishBehavior: FishBehaviorParams;

      struct Line3 {
        origin: vec3f,
        dir: vec3f,
      }

      fn projectPointOnLine(point: vec3f, line: Line3) -> vec3f {
        var pointVector = (point - line.origin);
        let projection = dot(pointVector, line.dir);
        return (line.origin + (line.dir * projection));
      }

      @group(1) @binding(2) var<uniform> mouseRay: Line3;

      @group(1) @binding(3) var<uniform> timePassed: f32;

      @group(1) @binding(1) var<storage, read_write> nextFishData: array<ModelData>;

      fn simulate(fishIndex: u32, _arg_1: u32, _arg_2: u32) {
        let fishData = (&currentFishData[fishIndex]);
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
          let other = (&currentFishData[i]);
          let dist = distance((*fishData).position, (*other).position);
          if ((dist < fishBehavior.separationDist)) {
            separation += ((*fishData).position - (*other).position);
          }
          if ((dist < fishBehavior.alignmentDist)) {
            alignment = (alignment + (*other).direction);
            alignmentCount = (alignmentCount + 1i);
          }
          if ((dist < fishBehavior.cohesionDist)) {
            cohesion = (cohesion + (*other).position);
            cohesionCount = (cohesionCount + 1i);
          }
        }
        if ((alignmentCount > 0i)) {
          alignment = (alignment / f32(alignmentCount));
        }
        if ((cohesionCount > 0i)) {
          cohesion = ((cohesion / f32(cohesionCount)) - (*fishData).position);
        }
        // unrolled iteration #0
        {
          var repulsion = vec3f();
          repulsion[0i] = 1f;
          const axisAquariumSize = 5f;
          let axisPosition = (*fishData).position[0i];
          const distance_1 = 0.1;
          if ((axisPosition > (axisAquariumSize - distance_1))) {
            let str2 = (axisPosition - (axisAquariumSize - distance_1));
            wallRepulsion = (wallRepulsion - (repulsion * str2));
          }
          if ((axisPosition < (-(axisAquariumSize) + distance_1))) {
            let str2 = ((-(axisAquariumSize) + distance_1) - axisPosition);
            wallRepulsion = (wallRepulsion + (repulsion * str2));
          }
        }
        // unrolled iteration #1
        {
          var repulsion = vec3f();
          repulsion[1i] = 1f;
          const axisAquariumSize = 2f;
          let axisPosition = (*fishData).position[1i];
          const distance_1 = 0.1;
          if ((axisPosition > (axisAquariumSize - distance_1))) {
            let str2 = (axisPosition - (axisAquariumSize - distance_1));
            wallRepulsion = (wallRepulsion - (repulsion * str2));
          }
          if ((axisPosition < (-(axisAquariumSize) + distance_1))) {
            let str2 = ((-(axisAquariumSize) + distance_1) - axisPosition);
            wallRepulsion = (wallRepulsion + (repulsion * str2));
          }
        }
        // unrolled iteration #2
        {
          var repulsion = vec3f();
          repulsion[2i] = 1f;
          const axisAquariumSize = 5f;
          let axisPosition = (*fishData).position[2i];
          const distance_1 = 0.1;
          if ((axisPosition > (axisAquariumSize - distance_1))) {
            let str2 = (axisPosition - (axisAquariumSize - distance_1));
            wallRepulsion = (wallRepulsion - (repulsion * str2));
          }
          if ((axisPosition < (-(axisAquariumSize) + distance_1))) {
            let str2 = ((-(axisAquariumSize) + distance_1) - axisPosition);
            wallRepulsion = (wallRepulsion + (repulsion * str2));
          }
        }
        var proj = projectPointOnLine((*fishData).position, mouseRay);
        var diff = ((*fishData).position - proj);
        const limit = 1.2;
        let str = (pow(2f, clamp((limit - length(diff)), 0f, limit)) - 1f);
        rayRepulsion = (normalize(diff) * str);
        var direction = (*fishData).direction;
        direction += (separation * fishBehavior.separationStr);
        direction += (alignment * fishBehavior.alignmentStr);
        direction += (cohesion * fishBehavior.cohesionStr);
        direction += (wallRepulsion * 1e-4f);
        direction += (rayRepulsion * 0.0015f);
        direction = (normalize(direction) * clamp(length((*fishData).direction), 0f, 0.01f));
        var translation = (direction * (min(999f, timePassed) / 8f));
        let nextFishData_1 = (&nextFishData[fishIndex]);
        (*nextFishData_1).position = ((*fishData).position + translation);
        (*nextFishData_1).direction = direction;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        simulate(in.id.x, in.id.y, in.id.z);
      }

      struct ModelData {
        position: vec3f,
        direction: vec3f,
        scale: f32,
        variant: f32,
        applySinWave: u32,
        applySeaFog: u32,
        applySeaDesaturation: u32,
      }

      @group(0) @binding(0) var<storage, read> modelData: array<ModelData>;

      struct PosAndNormal {
        position: vec3f,
        normal: vec3f,
      }

      fn applySinWave(index: u32, vertex: PosAndNormal, time: f32) -> PosAndNormal {
        const a = -60.1;
        const b = 0.8;
        const c = 6.1;
        var posMod = vec3f();
        posMod.z = (sin((f32(index) + (((time / a) + vertex.position.x) / b))) / c);
        let coeff = (cos((f32(index) + (((time / a) + vertex.position.x) / b))) / c);
        var newOX = normalize(vec3f(1f, 0f, coeff));
        var newOZ = vec3f(-(newOX.z), 0f, newOX.x);
        var newNormalXZ = ((newOX * vertex.normal.x) + (newOZ * vertex.normal.z));
        var wavedNormal = vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
        var wavedPosition = (vertex.position + posMod);
        return PosAndNormal(wavedPosition, wavedNormal);
      }

      @group(0) @binding(4) var<uniform> currentTime: f32;

      struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> camera: Camera;

      struct vertexShader_Output {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      struct vertexShader_Input {
        @location(0) modelPosition: vec3f,
        @location(1) modelNormal: vec3f,
        @location(2) textureUV: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn vertexShader(input: vertexShader_Input) -> vertexShader_Output {
        let currentModelData = (&modelData[input.instanceIndex]);
        var wavedVertex = PosAndNormal(input.modelPosition, input.modelNormal);
        if (((*currentModelData).applySinWave == 1u)) {
          wavedVertex = applySinWave(input.instanceIndex, PosAndNormal(input.modelPosition, input.modelNormal), currentTime);
        }
        var direction = normalize((*currentModelData).direction);
        let yaw = (-(atan2(direction.z, direction.x)) + 3.141592653589793f);
        let pitch = asin(-(direction.y));
        var scaleMatrix = mat4x4f(vec3f((*currentModelData).scale).x, 0, 0, 0, 0, vec3f((*currentModelData).scale).y, 0, 0, 0, 0, vec3f((*currentModelData).scale).z, 0, 0, 0, 0, 1);
        var pitchMatrix = mat4x4f(cos(pitch), sin(pitch), 0, 0, -sin(pitch), cos(pitch), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        var yawMatrix = mat4x4f(cos(yaw), 0, -sin(yaw), 0, 0, 1, 0, 0, sin(yaw), 0, cos(yaw), 0, 0, 0, 0, 1);
        var translationMatrix = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (*currentModelData).position.x, (*currentModelData).position.y, (*currentModelData).position.z, 1);
        var worldPosition = ((((translationMatrix * yawMatrix) * pitchMatrix) * scaleMatrix) * vec4f(wavedVertex.position, 1f));
        var worldNormal = normalize(((yawMatrix * pitchMatrix) * vec4f(wavedVertex.normal, 1f)).xyz);
        let worldPositionUniform = (&worldPosition);
        var canvasPosition = ((camera.projection * camera.view) * (*worldPositionUniform));
        return vertexShader_Output(worldPosition.xyz, worldNormal, canvasPosition, (*currentModelData).variant, input.textureUV, (*currentModelData).applySeaFog, (*currentModelData).applySeaDesaturation);
      }

      @group(0) @binding(1) var modelTexture: texture_2d<f32>;

      @group(0) @binding(3) var sampler_1: sampler;

      fn rgbToHsv(rgb: vec3f) -> vec3f {
        let r = rgb.x;
        let g = rgb.y;
        let b = rgb.z;
        let maxC = max(r, max(g, b));
        let minC = min(r, min(g, b));
        let delta = (maxC - minC);
        var h = 0f;
        var s = 0f;
        if ((maxC == 0f)) {
          s = 0f;
        }
        else {
          s = (delta / maxC);
        }
        let v = maxC;
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

      fn hsvToRgb(hsv: vec3f) -> vec3f {
        let h = hsv.x;
        let s = hsv.y;
        let v = hsv.z;
        let i = floor((h * 6f));
        let f = ((h * 6f) - i);
        let p = (v * (1f - s));
        let q = (v * (1f - (f * s)));
        let t = (v * (1f - ((1f - f) * s)));
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

      struct fragmentShader_Input {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
        @location(2) variant: f32,
        @location(3) textureUV: vec2f,
        @location(4) @interpolate(flat) applySeaFog: u32,
        @location(5) @interpolate(flat) applySeaDesaturation: u32,
      }

      @fragment fn fragmentShader(input: fragmentShader_Input) -> @location(0) vec4f {
        var textureColorWithAlpha = textureSample(modelTexture, sampler_1, input.textureUV);
        var textureColor = textureColorWithAlpha.rgb;
        var ambient = ((0.5f * textureColor) * vec3f(0.800000011920929, 0.800000011920929, 1));
        let cosTheta = dot(input.worldNormal, vec3f(-0.2357022613286972, 0.9428090453147888, -0.2357022613286972));
        var diffuse = ((max(0f, cosTheta) * textureColor) * vec3f(0.800000011920929, 0.800000011920929, 1));
        var viewSource = normalize((camera.position.xyz - input.worldPosition));
        var reflectSource = normalize(reflect(vec3f(0.2357022613286972, -0.9428090453147888, 0.2357022613286972), input.worldNormal));
        let specularStrength = pow(max(0f, dot(viewSource, reflectSource)), 16f);
        var specular = (specularStrength * vec3f(0.800000011920929, 0.800000011920929, 1));
        var lightedColor = ((ambient + diffuse) + specular);
        let distanceFromCamera = length((camera.position.xyz - input.worldPosition));
        var desaturatedColor = lightedColor;
        if ((input.applySeaDesaturation == 1u)) {
          let desaturationFactor = (-(atan2(((distanceFromCamera - 5f) / 10f), 1f)) / 3f);
          var hsv = rgbToHsv(desaturatedColor);
          hsv.y += (desaturationFactor / 2f);
          hsv.z += desaturationFactor;
          hsv.x += ((input.variant - 0.5f) * 0.2f);
          desaturatedColor = hsvToRgb(hsv);
        }
        var foggedColor = desaturatedColor;
        if ((input.applySeaFog == 1u)) {
          let fogParameter = max(0f, ((distanceFromCamera - 1.5f) * 0.2f));
          let fogFactor = (fogParameter / (1f + fogParameter));
          foggedColor = mix(foggedColor, vec3f(0, 0.47843137383461, 0.800000011920929), fogFactor);
        }
        return vec4f(foggedColor, 1f);
      }"
    `);
  });
});

/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('slime mold example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'slime-mold',
      expectedCalls: 4,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0f);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        let a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168f));
        seed_5.y = fract((cos(b) * 534.7645f));
        return seed_5.y;
      }

      fn randInUnitCircle_6() -> vec2f {
        let radius = sqrt(item_7());
        let angle = (item_7() * 6.283185307179586f);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      struct Agent_9 {
        position: vec2f,
        angle: f32,
      }

      @group(0) @binding(1) var<storage, read_write> agentsData_8: array<Agent_9, 200000>;

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed_3(((f32(x) / 2e+5f) + 0.1f));
        var pos = ((randInUnitCircle_6() * 140f) + vec2f(150, 75));
        let angle = atan2((75f - pos.y), (150f - pos.x));
        agentsData_8[x] = Agent_9(pos, angle);
      }

      struct mainCompute_Input_10 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_10)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(1) @binding(0) var oldState_1: texture_storage_2d<rgba8unorm, read>;

      struct Params_3 {
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params_2: Params_3;

      @group(1) @binding(1) var newState_4: texture_storage_2d<rgba8unorm, write>;

      struct blur_Input_5 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn blur_0(_arg_0: blur_Input_5) {
        var dims = textureDimensions(oldState_1);
        if (((_arg_0.gid.x >= dims.x) || (_arg_0.gid.y >= dims.y))) {
          return;
        }
        var sum = vec3f();
        var count = 0f;
        for (var offsetY = -1; (offsetY <= 1i); offsetY++) {
          for (var offsetX = -1; (offsetX <= 1i); offsetX++) {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(offsetX, offsetY));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState_1, vec2u(samplePos)).xyz;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
        }
        var blurred = (sum / count);
        var newColor = clamp((blurred - params_2.evaporationRate), vec3f(), vec3f(1));
        textureStore(newState_4, _arg_0.gid.xy, vec4f(newColor, 1f));
      }

      var<private> seed_3: vec2f;

      fn seed_2(value: f32) {
        seed_3 = vec2f(value, 0f);
      }

      fn randSeed_1(seed: f32) {
        seed_2(seed);
      }

      @group(1) @binding(0) var oldState_4: texture_storage_2d<rgba8unorm, read>;

      struct Agent_6 {
        position: vec2f,
        angle: f32,
      }

      @group(0) @binding(0) var<storage, read_write> agentsData_5: array<Agent_6, 200000>;

      fn item_8() -> f32 {
        let a = dot(seed_3, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_3, vec2f(54.47856521606445, 345.8415222167969));
        seed_3.x = fract((cos(a) * 136.8168f));
        seed_3.y = fract((cos(b) * 534.7645f));
        return seed_3.y;
      }

      fn randFloat01_7() -> f32 {
        return item_8();
      }

      struct Params_11 {
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(1) var<uniform> params_10: Params_11;

      fn sense_9(pos: vec2f, angle: f32, sensorAngleOffset: f32) -> f32 {
        let sensorAngle = (angle + sensorAngleOffset);
        var sensorDir = vec2f(cos(sensorAngle), sin(sensorAngle));
        var sensorPos = (pos + (sensorDir * params_10.sensorDistance));
        var dims = textureDimensions(oldState_4);
        var dimsf = vec2f(dims);
        var sensorPosInt = vec2u(clamp(sensorPos, vec2f(), (dimsf - vec2f(1))));
        var color = textureLoad(oldState_4, sensorPosInt).xyz;
        return ((color.x + color.y) + color.z);
      }

      @group(0) @binding(2) var<uniform> deltaTime_12: f32;

      @group(1) @binding(1) var newState_13: texture_storage_2d<rgba8unorm, write>;

      struct updateAgents_Input_14 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn updateAgents_0(_arg_0: updateAgents_Input_14) {
        if ((_arg_0.gid.x >= 200000u)) {
          return;
        }
        randSeed_1(((f32(_arg_0.gid.x) / 2e+5f) + 0.1f));
        var dims = textureDimensions(oldState_4);
        let agent = (&agentsData_5[_arg_0.gid.x]);
        let random = randFloat01_7();
        let weightForward = sense_9((*agent).position, (*agent).angle, 0f);
        let weightLeft = sense_9((*agent).position, (*agent).angle, params_10.sensorAngle);
        let weightRight = sense_9((*agent).position, (*agent).angle, -(params_10.sensorAngle));
        var angle = (*agent).angle;
        if (((weightForward > weightLeft) && (weightForward > weightRight))) {

        }
        else {
          if (((weightForward < weightLeft) && (weightForward < weightRight))) {
            angle = (angle + ((((random * 2f) - 1f) * params_10.turnSpeed) * deltaTime_12));
          }
          else {
            if ((weightRight > weightLeft)) {
              angle = (angle - (params_10.turnSpeed * deltaTime_12));
            }
            else {
              if ((weightLeft > weightRight)) {
                angle = (angle + (params_10.turnSpeed * deltaTime_12));
              }
            }
          }
        }
        var dir = vec2f(cos(angle), sin(angle));
        var newPos = ((*agent).position + (dir * (params_10.moveSpeed * deltaTime_12)));
        var dimsf = vec2f(dims);
        if (((((newPos.x < 0f) || (newPos.x > dimsf.x)) || (newPos.y < 0f)) || (newPos.y > dimsf.y))) {
          newPos = clamp(newPos, vec2f(), (dimsf - vec2f(1)));
          if (((newPos.x <= 0f) || (newPos.x >= (dimsf.x - 1f)))) {
            angle = (3.141592653589793f - angle);
          }
          if (((newPos.y <= 0f) || (newPos.y >= (dimsf.y - 1f)))) {
            angle = -(angle);
          }
          angle += ((random - 0.5f) * 0.1f);
        }
        agentsData_5[_arg_0.gid.x] = Agent_6(newPos, angle);
        var oldState = textureLoad(oldState_4, vec2u(newPos)).xyz;
        var newState = (oldState + vec3f(1));
        textureStore(newState_13, vec2u(newPos), vec4f(newState, 1f));
      }

      struct fullScreenTriangle_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangle_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangle_0(input: fullScreenTriangle_Input_2) -> fullScreenTriangle_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        var uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return fullScreenTriangle_Output_1(vec4f(pos[input.vertexIndex], 0f, 1f), uv[input.vertexIndex]);
      }

      @group(1) @binding(0) var state_4: texture_2d<f32>;

      @group(0) @binding(0) var filteringSampler_5: sampler;

      struct fragmentShader_Input_6 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader_3(_arg_0: fragmentShader_Input_6) -> @location(0) vec4f {
        return textureSample(state_4, filteringSampler_5, _arg_0.uv);
      }"
    `);
  });
});

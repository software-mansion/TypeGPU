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
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        {
          seed_1(seed);
        }
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randInUnitCircle() -> vec2f {
        let radius = sqrt(sample());
        let angle = (sample() * 6.283185307179586f);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      struct Agent {
        position: vec2f,
        angle: f32,
      }

      @group(0) @binding(1) var<storage, read_write> agentsData: array<Agent, 200000>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed(((f32(x) / 2e+5f) + 0.1f));
        var pos = ((randInUnitCircle() * 118f) + vec2f(128));
        let angle = atan2((128f - pos.y), (128f - pos.x));
        agentsData[x] = Agent(pos, angle);
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

      @group(1) @binding(0) var oldState: texture_storage_2d<rgba8unorm, read>;

      struct Params {
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      @group(1) @binding(1) var newState: texture_storage_2d<rgba8unorm, write>;

      struct blur_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn blur(_arg_0: blur_Input) {
        var dims = textureDimensions(oldState);
        if (((_arg_0.gid.x >= dims.x) || (_arg_0.gid.y >= dims.y))) {
          return;
        }
        var sum = vec3f();
        var count = 0f;
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(-1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #1
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(0, -1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #2
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(1, -1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(-1, 0));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #1
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i());
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #2
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(1, 0));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(-1, 1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #1
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(0, 1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
          // unrolled iteration #2
          {
            var samplePos = (vec2i(_arg_0.gid.xy) + vec2i(1));
            var dimsi = vec2i(dims);
            if (((((samplePos.x >= 0i) && (samplePos.x < dimsi.x)) && (samplePos.y >= 0i)) && (samplePos.y < dimsi.y))) {
              var color = textureLoad(oldState, vec2u(samplePos)).rgb;
              sum = (sum + color);
              count = (count + 1f);
            }
          }
        }
        var blurred = (sum / count);
        var newColor = clamp((blurred - params.evaporationRate), vec3f(), vec3f(1));
        textureStore(newState, _arg_0.gid.xy, vec4f(newColor, 1f));
      }

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        {
          seed_1(seed);
        }
      }

      @group(1) @binding(0) var oldState: texture_storage_2d<rgba8unorm, read>;

      struct Agent {
        position: vec2f,
        angle: f32,
      }

      @group(0) @binding(0) var<storage, read_write> agentsData: array<Agent, 200000>;

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

      struct Params {
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(1) var<uniform> params: Params;

      fn sense(pos: vec2f, angle: f32, sensorAngleOffset: f32) -> f32 {
        let sensorAngle = (angle + sensorAngleOffset);
        var sensorDir = vec2f(cos(sensorAngle), sin(sensorAngle));
        var sensorPos = (pos + (sensorDir * params.sensorDistance));
        var dims = textureDimensions(oldState);
        var dimsf = vec2f(dims);
        var sensorPosInt = vec2u(clamp(sensorPos, vec2f(), (dimsf - vec2f(1))));
        var color = textureLoad(oldState, sensorPosInt).rgb;
        return ((color.x + color.y) + color.z);
      }

      @group(0) @binding(2) var<uniform> deltaTime: f32;

      @group(1) @binding(1) var newState_1: texture_storage_2d<rgba8unorm, write>;

      struct updateAgents_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn updateAgents(_arg_0: updateAgents_Input) {
        if ((_arg_0.gid.x >= 200000u)) {
          return;
        }
        randSeed(((f32(_arg_0.gid.x) / 2e+5f) + 0.1f));
        var dims = textureDimensions(oldState);
        let agent = (&agentsData[_arg_0.gid.x]);
        let random = randFloat01();
        let weightForward = sense((*agent).position, (*agent).angle, 0f);
        let weightLeft = sense((*agent).position, (*agent).angle, params.sensorAngle);
        let weightRight = sense((*agent).position, (*agent).angle, -(params.sensorAngle));
        var angle = (*agent).angle;
        if (((weightForward > weightLeft) && (weightForward > weightRight))) {

        }
        else {
          if (((weightForward < weightLeft) && (weightForward < weightRight))) {
            angle = (angle + ((((random * 2f) - 1f) * params.turnSpeed) * deltaTime));
          }
          else {
            if ((weightRight > weightLeft)) {
              angle = (angle - (params.turnSpeed * deltaTime));
            }
            else {
              if ((weightLeft > weightRight)) {
                angle = (angle + (params.turnSpeed * deltaTime));
              }
            }
          }
        }
        var dir = vec2f(cos(angle), sin(angle));
        var newPos = ((*agent).position + (dir * (params.moveSpeed * deltaTime)));
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
        agentsData[_arg_0.gid.x] = Agent(newPos, angle);
        var oldState_1 = textureLoad(oldState, vec2u(newPos)).rgb;
        var newState = (oldState_1 + vec3f(1));
        textureStore(newState_1, vec2u(newPos), vec4f(newState, 1f));
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangle(input: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        var uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return fullScreenTriangle_Output(vec4f(pos[input.vertexIndex], 0f, 1f), uv[input.vertexIndex]);
      }

      @group(1) @binding(0) var state: texture_2d<f32>;

      @group(0) @binding(0) var filteringSampler: sampler;

      struct fragmentShader_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        return textureSample(state, filteringSampler, _arg_0.uv);
      }"
    `);
  });
});

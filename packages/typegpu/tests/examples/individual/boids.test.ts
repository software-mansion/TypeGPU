/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('boids example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'boids',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct TriangleData {
        position: vec2f,
        velocity: vec2f,
      }

      @group(1) @binding(0) var<storage, read> currentTrianglePos: array<TriangleData>;

      struct Params {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(1) var<uniform> paramsBuffer: Params;

      @group(1) @binding(1) var<storage, read_write> nextTrianglePos: array<TriangleData>;

      fn simulate(index: u32, _arg_1: u32, _arg_2: u32) {
        var instanceInfo = currentTrianglePos[index];
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = 0u; i < arrayLength((&currentTrianglePos)); i++) {
          let other = (&currentTrianglePos[i]);
          {
            let dist = distance(instanceInfo.position, (*other).position);
            if ((dist < paramsBuffer.separationDistance)) {
              separation = (separation + (instanceInfo.position - (*other).position));
            }
            if ((dist < paramsBuffer.alignmentDistance)) {
              alignment = (alignment + (*other).velocity);
              alignmentCount++;
            }
            if ((dist < paramsBuffer.cohesionDistance)) {
              cohesion = (cohesion + (*other).position);
              cohesionCount++;
            }
          }
        }
        if ((alignmentCount > 0i)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0i)) {
          cohesion = ((1f / f32(cohesionCount)) * cohesion);
          cohesion = (cohesion - instanceInfo.position);
        }
        var velocity = (paramsBuffer.separationStrength * separation);
        velocity = (velocity + (paramsBuffer.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer.cohesionStrength * cohesion));
        instanceInfo.velocity = (instanceInfo.velocity + velocity);
        instanceInfo.velocity = (clamp(length(instanceInfo.velocity), 0f, 0.01f) * normalize(instanceInfo.velocity));
        if ((instanceInfo.position.x > 1.03f)) {
          instanceInfo.position.x = -1.03f;
        }
        if ((instanceInfo.position.y > 1.03f)) {
          instanceInfo.position.y = -1.03f;
        }
        if ((instanceInfo.position.x < -1.03f)) {
          instanceInfo.position.x = 1.03f;
        }
        if ((instanceInfo.position.y < -1.03f)) {
          instanceInfo.position.y = 1.03f;
        }
        instanceInfo.position = (instanceInfo.position + instanceInfo.velocity);
        nextTrianglePos[index] = instanceInfo;
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

      fn getRotationFromVelocity(velocity: vec2f) -> f32 {
        return -(atan2(velocity.x, velocity.y));
      }

      fn rotate(v: vec2f, angle: f32) -> vec2f {
        let cos_1 = cos(angle);
        let sin_1 = sin(angle);
        return vec2f(((v.x * cos_1) - (v.y * sin_1)), ((v.x * sin_1) + (v.y * cos_1)));
      }

      @group(0) @binding(0) var<uniform> colorPalette: vec3f;

      struct mainVert_Output {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct mainVert_Input {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      @vertex fn mainVert(input: mainVert_Input) -> mainVert_Output {
        let angle = getRotationFromVelocity(input.velocity);
        var rotated = rotate(input.v, angle);
        var pos = vec4f((rotated + input.center), 0f, 1f);
        var color = vec4f(((sin((colorPalette + angle)) * 0.45f) + 0.45f), 1f);
        return mainVert_Output(pos, color);
      }

      struct mainFrag_Input {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn mainFrag(input: mainFrag_Input) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});

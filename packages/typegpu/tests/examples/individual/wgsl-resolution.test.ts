/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('wgsl resolution example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    await runExampleTest({
      category: 'tests',
      name: 'wgsl-resolution',
    }, device);

    const wgslElement = document.querySelector('.wgsl') as HTMLDivElement;

    expect(wgslElement.innerText).toMatchInlineSnapshot(`
      "fn get_rotation_from_velocity_util(velocity: vec2f) -> f32 {
        return -(atan2(velocity.x, velocity.y));
      }

      fn rotate_util(v: vec2f, angle: f32) -> vec2f {
        let cos_1 = cos(angle);
        let sin_1 = sin(angle);
        return vec2f(((v.x * cos_1) - (v.y * sin_1)), ((v.x * sin_1) + (v.y * cos_1)));
      }

      @group(1) @binding(0) var<uniform> colorPalette_1: vec3f;

      struct vertex_shader_Output {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct vertex_shader_Input {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      @vertex fn vertex_shader(input: vertex_shader_Input) -> vertex_shader_Output {
        let angle = get_rotation_from_velocity_util(input.velocity);
        var rotated = rotate_util(input.v, angle);
        var pos = vec4f((rotated.x + input.center.x), (rotated.y + input.center.y), 0f, 1f);
        let colorPalette = (&colorPalette_1);
        var color = vec4f(((sin((angle + (*colorPalette).x)) * 0.45f) + 0.45f), ((sin((angle + (*colorPalette).y)) * 0.45f) + 0.45f), ((sin((angle + (*colorPalette).z)) * 0.45f) + 0.45f), 1f);
        return vertex_shader_Output(pos, color);
      }

      struct fragment_shader_Input {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn fragment_shader(input: fragment_shader_Input) -> @location(0) vec4f {
        return input.color;
      }

      struct TriangleData {
        position: vec2f,
        velocity: vec2f,
      }

      @group(2) @binding(0) var<storage, read> currentTrianglePos_1: array<TriangleData>;

      struct Params {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(0) var<uniform> paramsBuffer: Params;

      @group(2) @binding(1) var<storage, read_write> nextTrianglePos: array<TriangleData>;

      struct compute_shader_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn compute_shader(input: compute_shader_Input) {
        let index = input.gid.x;
        let currentTrianglePos = (&currentTrianglePos_1);
        let instanceInfo = (&(*currentTrianglePos)[index]);
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = 0u; (i < arrayLength(&(*currentTrianglePos))); i++) {
          if ((i == index)) {
            continue;
          }
          let other = (&(*currentTrianglePos)[i]);
          let dist = distance((*instanceInfo).position, (*other).position);
          if ((dist < paramsBuffer.separationDistance)) {
            separation = (separation + ((*instanceInfo).position - (*other).position));
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
        if ((alignmentCount > 0i)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0i)) {
          cohesion = ((1f / f32(cohesionCount)) * cohesion);
          cohesion = (cohesion - (*instanceInfo).position);
        }
        var velocity = (paramsBuffer.separationStrength * separation);
        velocity = (velocity + (paramsBuffer.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer.cohesionStrength * cohesion));
        (*instanceInfo).velocity = ((*instanceInfo).velocity + velocity);
        (*instanceInfo).velocity = (clamp(length((*instanceInfo).velocity), 0f, 0.01f) * normalize((*instanceInfo).velocity));
        if (((*instanceInfo).position.x > 1.03f)) {
          (*instanceInfo).position.x = -1.03f;
        }
        if (((*instanceInfo).position.y > 1.03f)) {
          (*instanceInfo).position.y = -1.03f;
        }
        if (((*instanceInfo).position.x < -1.03f)) {
          (*instanceInfo).position.x = 1.03f;
        }
        if (((*instanceInfo).position.y < -1.03f)) {
          (*instanceInfo).position.y = 1.03f;
        }
        (*instanceInfo).position = ((*instanceInfo).position + (*instanceInfo).velocity);
        nextTrianglePos[index] = (*instanceInfo);
      }"
    `);
  });
});

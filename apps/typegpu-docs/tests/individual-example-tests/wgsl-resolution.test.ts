/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('wgsl resolution example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    await runExampleTest(
      {
        category: 'tests',
        name: 'wgsl-resolution',
      },
      device,
    );

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

      @vertex fn vertex_shader(@location(0) _arg_v: vec2f, @location(1) _arg_center: vec2f, @location(2) _arg_velocity: vec2f) -> vertex_shader_Output {
        let angle = get_rotation_from_velocity_util(_arg_velocity);
        var rotated = rotate_util(_arg_v, angle);
        var pos = vec4f((rotated.x + _arg_center.x), (rotated.y + _arg_center.y), 0f, 1f);
        let colorPalette = (&colorPalette_1);
        var color = vec4f(((sin((angle + (*colorPalette).x)) * 0.45f) + 0.45f), ((sin((angle + (*colorPalette).y)) * 0.45f) + 0.45f), ((sin((angle + (*colorPalette).z)) * 0.45f) + 0.45f), 1f);
        return vertex_shader_Output(pos, color);
      }

      struct fragment_shader_Input {
        @location(0) color: vec4f,
      }

      @fragment fn fragment_shader(_arg_0: fragment_shader_Input) -> @location(0) vec4f {
        return _arg_0.color;
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

      @compute @workgroup_size(1) fn compute_shader(@builtin(global_invocation_id) _arg_gid: vec3u) {
        let index = _arg_gid.x;
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

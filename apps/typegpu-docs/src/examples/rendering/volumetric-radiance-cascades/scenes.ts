import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const scenes = {
  'Shadertoy': 0,
  'Nothing': 1,
} as const;

// https://iquilezles.org/articles/distfunctions2d
const circle = tgpu.fn([d.vec4f, d.vec2f, d.f32, d.vec4f], d.vec4f)(
  (color, position, radius, albedo) => {
    'use gpu';
    const sanitizedRadius = std.max(0.001, radius);
    let result = d.vec4f(color);
    if (std.length(position) - sanitizedRadius < sanitizedRadius) {
      result = d.vec4f(albedo);
    }
    return result;
  },
);

const shadertoyScene = tgpu.fn([d.vec2f, d.f32], d.vec4f)(
  (worldPos, time) => {
    'use gpu';
    let color = d.vec4f(0.0);
    color = circle(
      color,
      d.vec2f(-0.7, 0).sub(worldPos),
      (std.sin(time) * 0.5 + 0.5) / 8,
      d.vec4f(1, 0.5, 0, 1),
    );
    color = circle(
      color,
      d.vec2f(0, std.sin(time) * 0.5).sub(worldPos),
      1 / 8,
      d.vec4f(0, 0, 0, 0.01),
    );
    color = circle(
      color,
      d.vec2f(0.7, 0).sub(worldPos),
      (-std.sin(time) * 0.5 + 0.5) / 8,
      d.vec4f(1, 1, 1, 1),
    );
    return color;
  },
);

export const getSceneColor = tgpu.fn([d.vec2f, d.f32, d.u32], d.vec4f)(
  (worldPos, time, selectedScene) => {
    if (selectedScene === 0) {
      return shadertoyScene(worldPos, time);
    }
    return d.vec4f(0, 0, 0, 1);
  },
);

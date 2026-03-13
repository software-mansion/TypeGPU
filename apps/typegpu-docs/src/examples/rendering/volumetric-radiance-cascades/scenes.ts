import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

export const scenes = {
  'Shadertoy': 0,
  'Hearts': 1,
  'Dots': 2,
} as const;

// https://iquilezles.org/articles/distfunctions2d
const circle = tgpu.fn([d.vec4f, d.vec2f, d.f32, d.vec4f], d.vec4f)(
  (color: d.v4f, position: d.v2f, radius: number, albedo: d.v4f) => {
    'use gpu';
    const sanitizedRadius = std.max(0.001, radius);
    let result = d.vec4f(color);
    if (sdf.sdDisk(position, sanitizedRadius) < 0) {
      result = d.vec4f(albedo);
    }
    return result;
  },
);

const dot2 = (v: d.v2f) => {
  'use gpu';
  return std.dot(v, v);
};

const sdHeart = (position: d.v2f) => {
  'use gpu';
  const p = position.xy;
  p.x = std.abs(p.x);
  if (p.y + p.x > 1.0) {
    return std.sqrt(dot2(p.sub(d.vec2f(0.25, 0.75)))) -
      std.sqrt(2.0) / 4.0;
  }
  return std.sqrt(
    std.min(
      dot2(p.sub(d.vec2f(0.00, 1.00))),
      dot2(p.sub(0.5 * std.max(p.x + p.y, 0.0))),
    ),
  ) * std.sign(p.x - p.y);
};

// https://iquilezles.org/articles/distfunctions2d
const heart = tgpu.fn([d.vec4f, d.vec2f, d.f32, d.vec4f], d.vec4f)(
  (color, position, radius, albedo) => {
    'use gpu';
    const distance = sdHeart(position.div(radius));

    let result = d.vec4f(color);
    if (distance < 0) {
      result = d.vec4f(albedo);
    }
    return result;
  },
);

const shadertoyScene = (worldPos: d.v2f, time: number) => {
  'use gpu';
  let color = d.vec4f(0.0);
  color = circle(
    color,
    d.vec2f(-0.7, 0).sub(worldPos),
    (std.sin(time) * 0.5 + 0.5) / 8 + 0.01,
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
    (-std.sin(time) * 0.5 + 0.5) / 8 + 0.01,
    d.vec4f(1, 1, 1, 1),
  );
  return color;
};

const heartsScene = (worldPos: d.v2f, time: number) => {
  'use gpu';
  const angle = Math.PI * 2 / 7;
  const colors = [
    d.vec4f(1.0, 0.0, 0.0, 1.0),
    d.vec4f(1.0, 0.69, 0.0, 1.0),
    d.vec4f(0.97, 1.0, 0.0, 1.0),
    d.vec4f(0.0, 1.0, 0.11, 1.0),
    d.vec4f(0.0, 1.0, 1.0, 1.0),
    d.vec4f(0.26, 0.0, 1.0, 1.0),
    d.vec4f(0.99, 0.0, 1.0, 1.0),
  ];

  let color = d.vec4f(0.0);
  for (let i = d.u32(0); i < 7; i++) {
    const position = d.vec2f(
      std.sin(time + angle * d.f32(i)),
      std.cos(time + angle * d.f32(i)) + 0.3,
    ).mul(0.7);
    color = heart(color, position.sub(worldPos), 0.3, colors[i]);
  }
  return color;
};

const Dot = d.struct({ position: d.vec2f, radius: d.f32, albedo: d.vec4f });
const dots = tgpu.const(
  d.arrayOf(Dot, 64),
  Array.from({ length: 64 }, () => ({
    position: d.vec2f(Math.random() * 1.6 - 0.8, Math.random() * 1.6 - 0.8),
    radius: Math.random() * 0.01 + 0.02,
    albedo: Math.random() < 0.3
      ? d.vec4f(1, 0.85, 0.2, 1)
      : d.vec4f(0, 0, 0, 1),
  })),
);

const dotsScene = (worldPos: d.v2f, time: number) => {
  'use gpu';
  let color = d.vec4f(0.0);
  for (let i = d.u32(0); i < dots.$.length; i++) {
    const offsetAngle = d.f32(i) +
      time * std.sign(d.f32(i % 2) - 0.5) * d.f32(i + 100) / 200;
    const offset = d.vec2f(std.sin(offsetAngle), std.cos(offsetAngle)).mul(
      0.1,
    );
    color = circle(
      color,
      dots.$[i].position.add(offset).sub(worldPos),
      dots.$[i].radius,
      dots.$[i].albedo,
    );
  }
  return color;
};

export const getSceneColor = (
  worldPos: d.v2f,
  time: number,
  selectedScene: number,
) => {
  'use gpu';
  if (selectedScene === scenes.Shadertoy) {
    return shadertoyScene(worldPos, time);
  }
  if (selectedScene === scenes.Hearts) {
    return heartsScene(worldPos, time);
  }
  if (selectedScene === scenes.Dots) {
    return dotsScene(worldPos, time);
  }
  return d.vec4f(0, 0, 0, 1);
};

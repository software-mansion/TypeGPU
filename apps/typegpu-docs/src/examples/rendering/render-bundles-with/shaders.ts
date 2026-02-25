import { perlin2d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import { cameraLayout, cubeLayout, terrainLayout, Vertex } from './schemas.ts';

const LOW_COLOR = d.vec3f(0.28, 0.52, 0.3);
const MID_COLOR = d.vec3f(0.76, 0.7, 0.5);
const HIGH_COLOR = d.vec3f(0.95, 0.95, 0.97);

const heightColor = tgpu.fn(
  [d.f32],
  d.vec3f,
)((t) => {
  const clamped = std.clamp(t, 0, 1);

  const lowToMid = std.mix(
    LOW_COLOR,
    MID_COLOR,
    std.smoothstep(0, 0.4, clamped),
  );
  const midToHigh = std.mix(
    lowToMid,
    HIGH_COLOR,
    std.smoothstep(0.4, 1, clamped),
  );

  return midToHigh;
});

const fbm = tgpu.fn(
  [d.vec2f],
  d.f32,
)((p) => {
  let value = perlin2d.sample(p) * 0.5;
  value += perlin2d.sample(p.mul(2)) * 0.25;
  value += perlin2d.sample(p.mul(4)) * 0.125;
  value += perlin2d.sample(p.mul(8)) * 0.0625;
  return value;
});

export const vertexFn = tgpu.vertexFn({
  in: {
    ...Vertex.propTypes,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    pos: d.builtin.position,
    worldNormal: d.vec3f,
    color: d.vec3f,
    worldPos: d.vec3f,
  },
})((input) => {
  'use gpu';
  const cube = cubeLayout.$.cubes[input.instanceIndex];
  const cam = cameraLayout.$.camera;
  const params = terrainLayout.$.terrain;

  const worldPos = cube.model * d.vec4f(input.position, 1);

  const cubeCenter = cube.model.columns[3];
  const noiseCoord = cubeCenter.xz * params.noiseScale;
  const height = fbm(noiseCoord) * params.terrainHeight;

  const displaced = d.vec4f(worldPos.x, worldPos.y + height, worldPos.z, 1);

  const worldNormal = std.normalize(
    (cube.model * d.vec4f(input.normal, 0)).xyz,
  );

  const t = height / params.terrainHeight + 0.5;
  const color = heightColor(t);

  return {
    pos: cam.projection * cam.view * displaced,
    worldNormal,
    color,
    worldPos: displaced.xyz,
  };
});

export const fragmentFn = tgpu.fragmentFn({
  in: {
    worldNormal: d.vec3f,
    color: d.vec3f,
    worldPos: d.vec3f,
  },
  out: d.vec4f,
})((input) => {
  const cam = cameraLayout.$.camera;
  const lightDir = std.normalize(d.vec3f(0.4, 1.0, 0.3));

  const diffuse = std.max(0, std.dot(input.worldNormal, lightDir));
  const ambient = 0.55;

  const viewDir = std.normalize(cam.position.xyz.sub(input.worldPos));
  const halfDir = std.normalize(lightDir.add(viewDir));
  const specular = std.pow(std.max(0, std.dot(input.worldNormal, halfDir)), 32);

  const lit = input.color
    .mul(ambient + diffuse * 0.85)
    .add(d.vec3f(specular * 0.3));
  return d.vec4f(lit, 1);
});

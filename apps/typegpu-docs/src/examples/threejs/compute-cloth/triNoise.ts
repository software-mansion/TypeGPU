import tgpu, { d, std } from 'typegpu';

const tri = (x: number): number => {
  'use gpu';
  return std.abs(std.fract(x) - 0.5);
};

const tri3 = (p: d.v3f): d.v3f => {
  'use gpu';
  return d.vec3f(tri(p.z + tri(p.y)), tri(p.z + tri(p.x)), tri(p.y + tri(p.x)));
};

/**
 * TSL.triNoise3D reimplemented in TypeGPU
 */
export const triNoise3D = tgpu.fn(
  [d.vec3f, d.f32, d.f32],
  d.f32,
)((position, speed, time) => {
  'use gpu';

  let p = d.vec3f(position);
  let z = d.f32(1.4);
  let rz = d.f32();
  let bp = d.vec3f(p);

  for (let i = d.f32(); i <= 3.0; i += 1) {
    const dg = tri3(bp * 2);
    p += dg + time * 0.1 * speed;
    bp *= 1.8;
    z *= 1.5;
    p *= 1.2;
    const t = tri(p.z + tri(p.x + tri(p.y)));
    rz = rz + t / z;
    bp += 0.14;
  }

  return rz;
});

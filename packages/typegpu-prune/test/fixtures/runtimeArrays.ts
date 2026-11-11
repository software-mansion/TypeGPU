import { d, tgpu } from 'typegpu';
import { precompile } from '@typegpu/prune';

export const arrays = precompile(() => {
  const Particle = d.struct({ position: d.vec2f, velocity: d.vec3f, mass: d.f16 });
  return {
    Floats: d.arrayOf(d.f32),
    Halves: d.arrayOf(d.f16),
    Particles: d.arrayOf(Particle),
    Rows: d.arrayOf(d.arrayOf(d.u32, 3)),
    Packed: d.disarrayOf(d.vec3f),
    PackedParticles: d.disarrayOf(d.unstruct({ id: d.u32, position: d.float32x3 })),
    // The elements on their own, the same codecs as each length's `elementType`
    Float: d.f32,
    Particle,
    layout: tgpu.bindGroupLayout({
      params: { uniform: Particle },
      floats: { storage: d.arrayOf(d.f32), access: 'mutable' },
      rows: { storage: d.arrayOf(d.u32, 3) },
      image: { texture: d.texture2d() },
    }),
  };
});

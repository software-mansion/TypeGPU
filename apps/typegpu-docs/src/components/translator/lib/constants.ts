export const TRANSLATOR_MODES = {
  WGSL: 'wgsl',
  TGSL: 'tgsl',
} as const;

export type TranslatorMode =
  typeof TRANSLATOR_MODES[keyof typeof TRANSLATOR_MODES];

export const DEFAULT_WGSL = `@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  let pos = array<vec2<f32>, 3>(
    vec2<f32>(-0.5, -0.5),
    vec2<f32>( 0.5, -0.5),
    vec2<f32>( 0.0,  0.5)
  );
  return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}`;

export const DEFAULT_TGSL = `import tgpu, { d } from 'typegpu';

const Particle = d.struct({
  position: d.vec3f,
  velocity: d.vec3f,
});

const SystemData = d.struct({
  particles: d.arrayOf(Particle, 100),
  gravity: d.vec3f,
  deltaTime: d.f32,
});

const layout = tgpu.bindGroupLayout({
  systemData: { storage: SystemData },
});

export const updateParicle = tgpu.fn([Particle, d.vec3f, d.f32], Particle)(
  (particle, gravity, deltaTime) => {
    const newVelocity = particle.velocity.mul(gravity).mul(deltaTime);
    const newPosition = particle.position.add(newVelocity.mul(deltaTime));

    return Particle({
      position: newPosition,
      velocity: newVelocity,
    });
  },
);

export function main() {
  'use gpu';
  const data = layout.$.systemData;
  for (let i = 0; i < data.particles.length; i++) {
    const particle = data.particles[i];
    data.particles[i] = updateParicle(particle, data.gravity, data.deltaTime);
  }
}`;

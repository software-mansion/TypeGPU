import { d, tgpu } from 'typegpu';

export const defaults = {
  textureSize: 512,
  solverIterations: 50,
  textInsidePressure: 1,
  textStartTemperature: 1,
  textOutlineWidth: 5.5,
  brushRadius: 100,
  softBrush: true,
  buoyancy: 140,
  timestep: 1.3,
  tempPower: 8,
  particleSize: 1.8,
  numParticles: 2500,
  maxParticles: 300000,
  densityDecay: 0.999,
  tempDecay: 0.996,
  vorticityStrength: 40,
  thermalStrength: 50,
  brushMode: 'Velocity' as const,
  renderMode: 'Fire' as const,
  text: 'TypeGPU.',
  cursorBlink: true,
  fireColor: d.vec3f(1, 0.425, 0),
};

export const textureSizeOptions = ['128', '256', '512', '1024', '2048'] as const;
export const brushModes = ['Instant', 'Constant Source', 'Velocity'] as const;
export const renderModes = ['Fire', 'Density', 'Velocity'] as const;

export const Clock = d.struct({
  time: d.f32,
  dt: d.f32,
});

export const BrushParams = d.struct({
  oldStampPos: d.vec2f,
  newStampPos: d.vec2f,
  origin: d.vec2u,
  radius: d.f32,
  isSoft: d.u32,
});

export const AdvectionParams = d.struct({
  brushMode: d.u32,
  isMouseDown: d.u32,
  mouseVelocity: d.vec2f,
  densityDecay: d.f32,
  tempDecay: d.f32,
});

export const ForceParams = d.struct({
  buoyancy: d.f32,
  vorticityStrength: d.f32,
  thermalStrength: d.f32,
});

export const Particle = d.struct({
  pos: d.vec2f,
  vel: d.vec2f,
  life: d.f32,
  maxLife: d.f32,
});

export const ParticleArray = d.arrayOf(Particle, defaults.maxParticles);

export const brushAccess = tgpu.accessor(BrushParams);
export const clockAccess = tgpu.accessor(Clock);
export const fireColorAccess = tgpu.accessor(d.vec3f);

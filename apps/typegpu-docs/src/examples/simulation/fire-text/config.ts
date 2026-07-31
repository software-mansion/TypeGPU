import { d } from 'typegpu';

export const defaults = {
  textureSize: 512,
  solverIterations: 50,
  numParticles: 2500,
  textInsidePressure: 1.0,
  textStartTemperature: 1.0,
  textOutlineWidth: 5.5,
  brushRadius: 100,
  softBrush: true,
  buoyancy: 140,
  timestep: 0.7,
  tempPower: 8.0,
  particleSize: 1.8,
  densityDecay: 0.999,
  tempDecay: 0.996,
  vorticityStrength: 40.0,
  thermalStrength: 50.0,
  brushMode: 'Velocity Brush' as const,
  renderMode: 'Fire' as const,
  text: 'TypeGPU.',
  cursorBlink: true,
  maxParticles: 20000,
} as const;

export const textureSizeOptions = ['128', '256', '512', '1024', '2048'] as const;
export const brushModes = ['Instant Brush', 'Constant Source Brush', 'Velocity Brush'] as const;
export const renderModes = ['Fire', 'Density', 'Velocity'] as const;

export const Config = d.struct({
  time: d.f32,
  dt: d.f32,
  stampPos: d.vec2u,
  velocity: d.vec2f,
  buoyancy: d.f32,
  radius: d.f32,
  isSoft: d.u32,
  isMouseDown: d.u32,
  brushMode: d.u32,
  textureSize: d.f32,
  textInsidePressure: d.f32,
  tempPower: d.f32,
  particleSize: d.f32,
  densityDecay: d.f32,
  tempDecay: d.f32,
  vorticityStrength: d.f32,
  thermalStrength: d.f32,
});

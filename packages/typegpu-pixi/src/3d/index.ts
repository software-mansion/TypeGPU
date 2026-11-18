export { uniforms, PixiUniforms } from '../uniforms.ts';
export type {
  UniformInput,
  UniformRecord,
  UniformSchema,
  UniformTarget,
  UniformValues,
} from '../uniforms.ts';
export { getRoot, isWebGPURenderer } from '../root.ts';

export { cameraPosition, fragment, time, vertex } from './builtins.ts';
export type { ShaderInput, ShaderVariable } from './builtins.ts';
export { shaderBit } from './shaderBit.ts';
export type { FragmentSlots, ShaderBitOptions, SlotFunction, VertexSlots } from './shaderBit.ts';
export {
  depthTexel,
  effectFragment,
  inputTexel,
  linearDepth,
  postEffect,
  sampleColor,
  sampleColor2,
  sampleColorLod,
  sampleDepth,
  texel,
  viewPos,
  viewTexel,
} from './postEffect.ts';
export type {
  EffectFragmentOptions,
  EffectFunction,
  PostEffectDefinition,
  TgpuPostEffectOptions,
} from './postEffect.ts';

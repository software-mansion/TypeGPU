//
// SMoL (or Shader Module Lite) - a way to encode shader logic with JS values with the smallest amount of code possible.
//

export * from './nodes';
export { generateFunction, UnknownData } from './wgslGenerator';
export type { GenerationCtx, Resource } from './wgslGenerator';

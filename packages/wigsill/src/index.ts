export * from './errors';
export * from './types';
export { AsCallable, ICallable } from './callable';
export * from './wigsillRuntime';
export { default as ProgramBuilder, type Program } from './programBuilder';
export { StrictNameRegistry, RandomNameRegistry } from './nameRegistry';

// Can import `wgsl` in two ways:
//   import { wgsl } from 'wigsill';
// and:
//   import wgsl from 'wigsill';
export { default as wgsl } from './wgsl';
export { default } from './wgsl';

export type { WgslBuffer } from './wgslBuffer';
export type { WgslCode } from './wgslCode';
export type { WgslConst } from './wgslConstant';
export type { WgslFn } from './wgslFunction';
export type { WgslFn as WgslFnExperimental } from './wgslFunctionExperimental';
export type { WgslVar } from './wgslVariable';

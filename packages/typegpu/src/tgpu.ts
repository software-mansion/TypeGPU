// NOTE: This is a barrel file, internal files should not import things from this file

export { constant as const } from './core/constant/tgpuConstant.ts';
export { fn } from './core/function/tgpuFn.ts';
export { comptime } from './core/function/comptime.ts';
export { resolve, resolveWithContext } from './core/resolve/tgpuResolve.ts';
export { init, initFromDevice } from './core/root/init.ts';
export { slot } from './core/slot/slot.ts';
export { lazy } from './core/slot/lazy.ts';
export { accessor, mutableAccessor } from './core/slot/accessor.ts';
export { privateVar, workgroupVar } from './core/variable/tgpuVariable.ts';
export { vertexLayout } from './core/vertexLayout/vertexLayout.ts';
export { bindGroupLayout } from './tgpuBindGroupLayout.ts';
export { computeFn } from './core/function/tgpuComputeFn.ts';
export { fragmentFn } from './core/function/tgpuFragmentFn.ts';
export { vertexFn } from './core/function/tgpuVertexFn.ts';

export * as '~unstable' from './tgpuUnstable.ts';

// NOTE: This is a barrel file, internal files should not import things from this file

export {
  /** @deprecated This feature is now stable, use tgpu.const. */
  constant as const,
} from './core/constant/tgpuConstant.ts';
export { declare } from './core/declare/tgpuDeclare.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.comptime. */
  comptime,
} from './core/function/comptime.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.computeFn. */
  computeFn,
} from './core/function/tgpuComputeFn.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.fn. */
  fn,
} from './core/function/tgpuFn.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.fragmentFn. */
  fragmentFn,
} from './core/function/tgpuFragmentFn.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.vertexFn. */
  vertexFn,
} from './core/function/tgpuVertexFn.ts';
export { rawCodeSnippet } from './core/rawCodeSnippet/tgpuRawCodeSnippet.ts';
export { namespace } from './core/resolve/namespace.ts';
export { simulate } from './core/simulate/tgpuSimulate.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.accessor. */
  accessor,
  /** @deprecated This feature is now stable, use tgpu.mutableAccessor. */
  mutableAccessor,
} from './core/slot/accessor.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.lazy. */
  lazy as derived,
} from './core/slot/lazy.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.slot. */
  slot,
} from './core/slot/slot.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.privateVar. */
  privateVar,
  /** @deprecated This feature is now stable, use tgpu.workgroupVar. */
  workgroupVar,
} from './core/variable/tgpuVariable.ts';
export {
  /** @deprecated This feature is now stable, use tgpu.vertexLayout. */
  vertexLayout,
} from './core/vertexLayout/vertexLayout.ts';

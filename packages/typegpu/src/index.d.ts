/**
 * @module typegpu
 */

// NOTE: This is a barrel file, internal files should not import things from this file

export declare const tgpu: {
  const: typeof import('./core/constant/tgpuConstant.ts').constant;
  fn: typeof import('./core/function/tgpuFn.ts').fn;
  comptime: typeof import('./core/function/comptime.ts').comptime;
  resolve: typeof import('./core/resolve/tgpuResolve.ts').resolve;
  resolveWithContext:
    typeof import('./core/resolve/tgpuResolve.ts').resolveWithContext;
  init: typeof import('./core/root/init.ts').init;
  initFromDevice: typeof import('./core/root/init.ts').initFromDevice;
  slot: typeof import('./core/slot/slot.ts').slot;
  lazy: typeof import('./core/slot/lazy.ts').lazy;
  accessor: typeof import('./core/slot/accessor.ts').accessor;
  mutableAccessor: typeof import('./core/slot/accessor.ts').mutableAccessor;
  privateVar: typeof import('./core/variable/tgpuVariable.ts').privateVar;
  workgroupVar: typeof import('./core/variable/tgpuVariable.ts').workgroupVar;
  vertexLayout:
    typeof import('./core/vertexLayout/vertexLayout.ts').vertexLayout;
  bindGroupLayout: typeof import('./tgpuBindGroupLayout.ts').bindGroupLayout;
  computeFn: typeof import('./core/function/tgpuComputeFn.ts').computeFn;
  fragmentFn: typeof import('./core/function/tgpuFragmentFn.ts').fragmentFn;
  vertexFn: typeof import('./core/function/tgpuVertexFn.ts').vertexFn;
  unroll: typeof import('./core/unroll/tgpuUnroll.ts').unroll;

  '~unstable': typeof import('./tgpuUnstable.ts');
};

export default tgpu;

export * from './indexNamedExports.ts';

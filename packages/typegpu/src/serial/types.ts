import type { TgpuRoot } from '../core/root/rootTypes.ts';

/** Lets restored resources resolve the root they belong to, identified by the shared `GPUDevice` */
export interface RestoreContext {
  getRoot(device: GPUDevice): TgpuRoot;
}

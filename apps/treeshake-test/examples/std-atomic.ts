// Standard library - atomic functions
import { atomicAdd, atomicLoad, atomicStore, workgroupBarrier } from 'typegpu/std';

console.log('Atomic functions:', {
  atomicAdd: typeof atomicAdd,
  atomicLoad: typeof atomicLoad,
  atomicStore: typeof atomicStore,
  workgroupBarrier: typeof workgroupBarrier,
});
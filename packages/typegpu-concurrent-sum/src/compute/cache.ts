import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

export class ConcurrentSumCache {
  private cacheMap: Array<TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag>;
  constructor(private root: TgpuRoot, private n: number, neededBuffers = 4) {
    this.cacheMap = Array.from(
      { length: neededBuffers },
      () => this.root.createBuffer(d.arrayOf(d.u32, n)).$usage('storage'),
    );
  }

  push(buffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag): void {
    this.cacheMap.push(buffer);
  }

  pop(): TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag {
    if (this.cacheMap.length === 0) {
      return this.root.createBuffer(d.arrayOf(d.u32, this.n)).$usage('storage');
    }
    const buffer = this.cacheMap.pop();
    return buffer as TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;
  }

  clear(): void {
    this.cacheMap = [];
  }
}

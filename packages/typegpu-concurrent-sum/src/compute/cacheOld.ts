import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

export class ConcurrentSumCache {
  private buffers: {
    [key: string]: (TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag) | undefined;
  };

  private readIndex = 0;
  private writeIndex = 0;
  private count = 4;

  constructor(private root: TgpuRoot, private n: number, private capacity = 4) {
    this.buffers = {
      0: root.createBuffer(d.arrayOf(d.u32, n)).$usage('storage'),
      1: root.createBuffer(d.arrayOf(d.u32, n)).$usage('storage'),
      2: root.createBuffer(d.arrayOf(d.u32, n)).$usage('storage'),
      3: root.createBuffer(d.arrayOf(d.u32, n)).$usage('storage'),
    };
  }

  push(buffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag): void {
    if (this.count === this.capacity) {
      return; // buffer overflow
    }
    this.buffers[this.writeIndex] = buffer;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.count++;
  }

  pop(): TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag {
    if (this.count === 0) {
      console.log('Cache is empty, returning a new buffer.');
      return this.root.createBuffer(d.arrayOf(d.u32, this.n)).$usage('storage');
    }
    const buffer = this.buffers[this.readIndex];
    this.buffers[this.readIndex] = undefined; // available after popping
    this.readIndex = (this.readIndex + 1) % this.capacity;
    this.count--;
    return buffer as TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag; //obviously may return undefined, but impossible (unprobable?) due to how Bielloch scan works
  }
}

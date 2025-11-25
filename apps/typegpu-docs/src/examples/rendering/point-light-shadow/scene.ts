import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { BoxGeometry } from './box-geometry.ts';
import { InstanceData } from './types.ts';

export class Scene {
  readonly #root: TgpuRoot;
  readonly #objects: BoxGeometry[] = [];

  #instanceBuffer;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.#instanceBuffer = root
      .createBuffer(d.arrayOf(InstanceData, 0), [])
      .$usage('vertex');
  }

  add(object: BoxGeometry) {
    this.#objects.push(object);
    this.#rebuildBuffer();
  }

  remove(object: BoxGeometry) {
    const index = this.#objects.indexOf(object);
    if (index !== -1) {
      this.#objects.splice(index, 1);
      this.#rebuildBuffer();
    }
  }

  update() {
    this.#instanceBuffer.write(this.#objects.map((obj) => obj.instanceData));
  }

  #rebuildBuffer() {
    const data = this.#objects.map((obj) => obj.instanceData);
    this.#instanceBuffer = this.#root
      .createBuffer(d.arrayOf(InstanceData, data.length), data)
      .$usage('vertex');
  }

  get instanceBuffer() {
    return this.#instanceBuffer;
  }

  get instanceCount() {
    return this.#objects.length;
  }
}

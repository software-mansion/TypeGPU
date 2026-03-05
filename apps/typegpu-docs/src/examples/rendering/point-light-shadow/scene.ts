import type { TgpuRoot } from 'typegpu';
import { d } from 'typegpu';
import type { BoxGeometry } from './box-geometry.ts';
import { InstanceData } from './types.ts';

export class Scene {
  readonly #root: TgpuRoot;
  readonly #objects: BoxGeometry[] = [];

  #instanceBuffer;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.#instanceBuffer = root.createBuffer(d.arrayOf(InstanceData, 0), []).$usage('vertex');
  }

  add(object: BoxGeometry | BoxGeometry[]) {
    const items = Array.isArray(object) ? object : [object];
    if (items.length === 0) {
      return;
    }
    this.#objects.push(...items);
    this.#rebuildBuffer();
  }

  remove(object: BoxGeometry | BoxGeometry[]) {
    const items = Array.isArray(object) ? object : [object];
    if (items.length === 0) {
      return;
    }
    this.#objects.splice(
      0,
      this.#objects.length,
      ...this.#objects.filter((obj) => !items.includes(obj)),
    );
    this.#rebuildBuffer();
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

import { d } from 'typegpu';
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import {
  DepthDType,
  DepthTensorLayout,
  type DepthBundle,
  type DepthTensor,
  type DepthTensorId,
} from './types.ts';

export type Hwc4TensorBuffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
export type F16Hwc4TensorBuffer = TgpuBuffer<d.WgslArray<d.Vec4h>> & StorageFlag;
export type ScalarTensorBuffer = TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
export type DepthTensorBuffer = Hwc4TensorBuffer | F16Hwc4TensorBuffer | ScalarTensorBuffer;

function storageKey(tensor: DepthTensor): string | undefined {
  switch (tensor.storage.kind) {
    case 'input':
      return 'input';
    case 'output':
      return 'output';
    case 'slot':
      return `slot:${tensor.storage.slotId}`;
    case 'section':
      return undefined;
  }
}

function createRawAllocation(root: TgpuRoot, byteLength: number): GPUBuffer {
  return root.device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
}

function tensorView(root: TgpuRoot, tensor: DepthTensor, allocation: GPUBuffer): DepthTensorBuffer {
  if (tensor.layout === DepthTensorLayout.Raw) {
    return root
      .createBuffer(d.arrayOf(d.f32, tensor.byteLength / 4), allocation)
      .$usage('storage') as ScalarTensorBuffer;
  }

  if (tensor.dtype === DepthDType.F16) {
    return root
      .createBuffer(d.arrayOf(d.vec4h, tensor.byteLength / 8), allocation)
      .$usage('storage') as F16Hwc4TensorBuffer;
  }

  return root
    .createBuffer(d.arrayOf(d.vec4f, tensor.byteLength / 16), allocation)
    .$usage('storage') as Hwc4TensorBuffer;
}

export class DepthTensorArena {
  readonly #allocations = new Map<string, GPUBuffer>();
  readonly #views = new Map<DepthTensorId, DepthTensorBuffer>();
  readonly #input: Hwc4TensorBuffer;
  readonly #output: Hwc4TensorBuffer;

  constructor(root: TgpuRoot, bundle: DepthBundle) {
    const storageSizes = new Map<string, number>();
    for (const tensor of bundle.tensors) {
      const key = storageKey(tensor);
      if (key !== undefined) {
        storageSizes.set(key, Math.max(storageSizes.get(key) ?? 0, tensor.byteLength));
      }
    }
    for (const slot of bundle.slots) {
      const key = `slot:${slot.id}`;
      storageSizes.set(key, Math.max(storageSizes.get(key) ?? 0, slot.byteLength));
    }

    for (const [key, byteLength] of storageSizes) {
      this.#allocations.set(key, createRawAllocation(root, byteLength));
    }

    for (const tensor of bundle.tensors) {
      const key = storageKey(tensor);
      const allocation = key === undefined ? undefined : this.#allocations.get(key);
      if (allocation !== undefined) {
        this.#views.set(tensor.id, tensorView(root, tensor, allocation));
      }
    }

    this.#input = this.bufferFor(bundle.input.tensorId) as Hwc4TensorBuffer;
    this.#output = this.bufferFor(bundle.output.tensorId) as Hwc4TensorBuffer;
  }

  get inputBuffer(): Hwc4TensorBuffer {
    return this.#input;
  }

  get outputBuffer(): Hwc4TensorBuffer {
    return this.#output;
  }

  bufferFor(tensorId: DepthTensorId): DepthTensorBuffer {
    return this.#views.get(tensorId) as DepthTensorBuffer;
  }

  rawBufferFor(tensorId: DepthTensorId): GPUBuffer {
    return this.bufferFor(tensorId).buffer;
  }

  destroy(): void {
    for (const allocation of this.#allocations.values()) {
      allocation.destroy();
    }
  }
}

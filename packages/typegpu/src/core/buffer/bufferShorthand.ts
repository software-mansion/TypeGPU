import type { BaseData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import { setName, type TgpuNamable } from '../../shared/meta.ts';
import type { Infer, InferGPU, InferPartial } from '../../shared/repr.ts';
import { $getNameForward } from '../../shared/symbols.ts';
import type { TgpuBuffer, UniformFlag } from './buffer.ts';

// ----------
// Public API
// ----------

export interface TgpuMutable<TData extends BaseData> extends TgpuNamable {
  readonly resourceType: 'mutable';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the CPU
  write(data: Infer<TData>): void;
  writePartial(data: InferPartial<TData>): void;
  read(): Promise<Infer<TData>>;
  // ---

  // Accessible on the GPU
  value: InferGPU<TData>;
  $: InferGPU<TData>;
  // ---
}

export interface TgpuReadonly<TData extends BaseData> extends TgpuNamable {
  readonly resourceType: 'readonly';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the CPU
  write(data: Infer<TData>): void;
  writePartial(data: InferPartial<TData>): void;
  read(): Promise<Infer<TData>>;
  // ---

  // Accessible on the GPU
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---
}

export interface TgpuUniform<TData extends BaseData> extends TgpuNamable {
  readonly resourceType: 'uniform';
  readonly buffer: TgpuBuffer<TData> & UniformFlag;

  // Accessible on the CPU
  write(data: Infer<TData>): void;
  writePartial(data: InferPartial<TData>): void;
  read(): Promise<Infer<TData>>;
  // ---

  // Accessible on the GPU
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---
}

// --------------
// Implementation
// --------------

export class TgpuBufferShorthandImpl<
  TType extends 'mutable' | 'readonly' | 'uniform',
  TData extends BaseData,
> {
  readonly [$getNameForward]: object;

  constructor(
    public readonly resourceType: TType,
    public readonly buffer:
      & TgpuBuffer<TData>
      & (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag),
  ) {
    this[$getNameForward] = buffer;
  }

  $name(label: string): this {
    setName(this[$getNameForward], label);
    return this;
  }

  write(data: Infer<TData>): void {
    this.buffer.write(data);
  }

  writePartial(data: InferPartial<TData>): void {
    this.buffer.writePartial(data);
  }

  read(): Promise<Infer<TData>> {
    return this.buffer.read();
  }

  get value(): InferGPU<TData> {
    // biome-ignore lint/suspicious/noExplicitAny: too complex a type
    return (this.buffer as any).as(this.resourceType).value;
  }

  get $(): InferGPU<TData> {
    return this.value;
  }
}

import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { BufferUsage, WgslAllocatable } from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import type WigsillRuntime from './wigsillRuntime';

// ----------
// Public API
// ----------

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> extends WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData, TAllows>;
  $allowUniform(): WgslBuffer<TData, TAllows | 'uniform'>;
  $allowReadonlyStorage(): WgslBuffer<TData, TAllows | 'readonly_storage'>;
  $allowMutableStorage(): WgslBuffer<TData, TAllows | 'mutable_storage'>;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData, TAllows>;

  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;

  asUniform(): 'uniform' extends TAllows
    ? WgslBufferUsage<TData, 'uniform'>
    : null;

  asStorage(): 'mutable_storage' extends TAllows
    ? WgslBufferUsage<TData, 'mutable_storage'>
    : null;

  asReadonlyStorage(): 'readonly_storage' extends TAllows
    ? WgslBufferUsage<TData, 'readonly_storage'>
    : null;
}

export function buffer<
  TData extends AnyWgslData,
  TUsage extends BufferUsage = never,
>(typeSchema: TData): WgslBuffer<TData, TUsage> {
  return new WgslBufferImpl<TData, TUsage>(typeSchema);
}

// --------------
// Implementation
// --------------

class WgslBufferImpl<
  TData extends AnyWgslData,
  TAllows extends BufferUsage = never,
> implements WgslBuffer<TData, TAllows>
{
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

  private allowedUsages: {
    uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
    mutableStorage: WgslBufferUsage<TData, TAllows | 'mutable_storage'> | null;
    readonlyStorage: WgslBufferUsage<
      TData,
      TAllows | 'readonly_storage'
    > | null;
  } = {
    uniform: null,
    mutableStorage: null,
    readonlyStorage: null,
  };

  public debugLabel?: string | undefined;

  constructor(public readonly dataType: TData) {}

  $name(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  write(runtime: WigsillRuntime, data: Parsed<TData>): void {
    const gpuBuffer = runtime.bufferFor(this);

    const hostBuffer = new ArrayBuffer(this.dataType.size);
    this.dataType.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      gpuBuffer,
      0,
      hostBuffer,
      0,
      this.dataType.size,
    );
  }

  async read(runtime: WigsillRuntime): Promise<Parsed<TData>> {
    const arrayBuffer = await runtime.valueFor(this);

    const res = this.dataType.read(
      new BufferReader(arrayBuffer),
    ) as Parsed<TData>;
    return res;
  }

  $allowUniform() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'uniform'>;
    this.$addFlags(GPUBufferUsage.UNIFORM);
    if (!this.allowedUsages.uniform) {
      this.allowedUsages.uniform = bufferUsage(enrichedThis, 'uniform');
    }
    return enrichedThis;
  }

  $allowReadonlyStorage() {
    const enrichedThis = this as WgslBuffer<
      TData,
      TAllows | 'readonly_storage'
    >;
    this.$addFlags(GPUBufferUsage.STORAGE);
    if (!this.allowedUsages.readonlyStorage) {
      this.allowedUsages.readonlyStorage = bufferUsage(
        enrichedThis,
        'readonly_storage',
      );
    }
    return enrichedThis;
  }

  $allowMutableStorage() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutable_storage'>;
    this.$addFlags(GPUBufferUsage.STORAGE);
    if (!this.allowedUsages.mutableStorage) {
      this.allowedUsages.mutableStorage = bufferUsage(
        enrichedThis,
        'mutable_storage',
      );
    }
    return enrichedThis;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  asUniform() {
    return this.allowedUsages.uniform as 'uniform' extends TAllows
      ? WgslBufferUsage<TData, 'uniform'>
      : null;
  }

  asStorage() {
    return this.allowedUsages
      .mutableStorage as 'mutable_storage' extends TAllows
      ? WgslBufferUsage<TData, 'mutable_storage'>
      : null;
  }

  asReadonlyStorage() {
    return this.allowedUsages
      .readonlyStorage as 'readonly_storage' extends TAllows
      ? WgslBufferUsage<TData, 'readonly_storage'>
      : null;
  }
}

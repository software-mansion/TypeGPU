import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type {
  BufferUsage,
  ResolutionCtx,
  WgslAllocatable,
  WgslResolvable,
} from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
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
  public fieldIdentifier = new WgslIdentifier();
  public extraFlags: GPUBufferUsageFlags =
    GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

  private allowedUsages: {
    uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
    storage: WgslBufferUsage<TData, TAllows | 'mutable_storage'> | null;
    readOnlyStorage: WgslBufferUsage<
      TData,
      TAllows | 'readonly_storage'
    > | null;
  } = {
    uniform: null,
    storage: null,
    readOnlyStorage: null,
  };

  public debugLabel?: string | undefined;

  constructor(public readonly dataType: TData) {}

  $name(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.fieldIdentifier.$name(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this.fieldIdentifier);
  }

  write(runtime: WigsillRuntime, data: Parsed<TData>): boolean {
    const memoryLocation = runtime.bufferFor(this);

    if (!memoryLocation) {
      console.warn('Cannot write to the memory, as it has not been allocated');
      return false;
    }

    const hostBuffer = new ArrayBuffer(this.dataType.size);
    this.dataType.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      memoryLocation,
      0,
      hostBuffer,
      0,
      this.dataType.size,
    );

    return true;
  }

  async read(runtime: WigsillRuntime): Promise<Parsed<TData>> {
    const arrayBuffer = await runtime.valueFor(this);
    if (!arrayBuffer) {
      throw new Error('Value could not be received by runtime');
    }

    const res = this.dataType.read(
      new BufferReader(arrayBuffer),
    ) as Parsed<TData>;
    return res;
  }

  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable {
    const bindingType = 'uniform';

    return code`
    @group(${bindingGroup}) @binding(${bindingIdx}) var<${bindingType}> ${this.fieldIdentifier}: ${this.dataType};
    `;
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
    if (!this.allowedUsages.readOnlyStorage) {
      this.allowedUsages.readOnlyStorage = bufferUsage(
        enrichedThis,
        'readonly_storage',
      );
    }
    return enrichedThis;
  }

  $allowMutableStorage() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutable_storage'>;
    this.$addFlags(GPUBufferUsage.STORAGE);
    if (!this.allowedUsages.storage) {
      this.allowedUsages.storage = bufferUsage(enrichedThis, 'mutable_storage');
    }
    return enrichedThis;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.extraFlags |= flags;
    return this;
  }

  asUniform(): 'uniform' extends TAllows
    ? WgslBufferUsage<TData, 'uniform'>
    : null {
    return this.allowedUsages.uniform as 'uniform' extends TAllows
      ? WgslBufferUsage<TData, 'uniform'>
      : null;
  }

  asStorage(): 'mutable_storage' extends TAllows
    ? WgslBufferUsage<TData, 'mutable_storage'>
    : null {
    return this.allowedUsages.storage as 'mutable_storage' extends TAllows
      ? WgslBufferUsage<TData, 'mutable_storage'>
      : null;
  }

  asReadonlyStorage(): 'readonly_storage' extends TAllows
    ? WgslBufferUsage<TData, 'readonly_storage'>
    : null {
    return this.allowedUsages
      .readOnlyStorage as 'readonly_storage' extends TAllows
      ? WgslBufferUsage<TData, 'readonly_storage'>
      : null;
  }
}

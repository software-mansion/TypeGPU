import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { ResolutionCtx, WgslAllocatable, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import type WigsillRuntime from './wigsillRuntime';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';

// ----------
// Public API
// ----------

export interface WgslBuffer<TData extends AnyWgslData>
  extends WgslResolvable,
    WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData>;
  fieldIdentifier: WgslIdentifier;

  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;
  flags: GPUBufferUsageFlags;
  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable;
  $allowUniform(): WgslBuffer<TData>;
  $allowReadonlyStorage(): WgslBuffer<TData>;
  $allowMutableStorage(): WgslBuffer<TData>;
  asUniform(): WgslBufferUsage<TData, 'uniform'> | null;
  asStorage(): WgslBufferUsage<TData, 'storage'> | null;
  asReadOnlyStorage(): WgslBufferUsage<TData, 'read-only-storage'> | null;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData>;
}

export function buffer<TData extends AnyWgslData>(
  typeSchema: TData,
): WgslBuffer<TData> {
  return new WgslBufferImpl(typeSchema);
}

// --------------
// Implementation
// --------------

class WgslBufferImpl<TData extends AnyWgslData> implements WgslBuffer<TData> {
  public fieldIdentifier = new WgslIdentifier();
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private allowedUsages: {
    uniform: WgslBufferUsage<TData, 'uniform'> | null;
    storage: WgslBufferUsage<TData, 'storage'> | null;
    readOnlyStorage: WgslBufferUsage<TData, 'read-only-storage'> | null;
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
    // after resolving all dependencies, add memory.
    ctx.addAllocatable(this);

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
    if (!this.allowedUsages.uniform) {
      this.allowedUsages.uniform = bufferUsage(this, 'uniform');
    }
    return this;
  }

  $allowReadonlyStorage() {
    if (!this.allowedUsages.readOnlyStorage) {
      this.allowedUsages.readOnlyStorage = bufferUsage(
        this,
        'read-only-storage',
      );
    }
    return this;
  }

  $allowMutableStorage() {
    if (!this.allowedUsages.storage) {
      this.allowedUsages.storage = bufferUsage(this, 'storage');
    }
    return this;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  asUniform(): WgslBufferUsage<TData, 'uniform'> | null {
    return this.allowedUsages.uniform;
  }

  asStorage(): WgslBufferUsage<TData, 'storage'> | null {
    return this.allowedUsages.storage;
  }

  asReadOnlyStorage(): WgslBufferUsage<TData, 'read-only-storage'> | null {
    return this.allowedUsages.readOnlyStorage;
  }
}

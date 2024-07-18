import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { ResolutionCtx, WgslAllocatable, WgslResolvable } from './types';
import { type WgslBufferUsage, bufferUsage } from './wgslBufferUsage';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import type WigsillRuntime from './wigsillRuntime';

// ----------
// Public API
// ----------

export interface WgslBuffer<
  TData extends AnyWgslData,
  TAllows extends 'uniform' | 'readonlyStorage' | 'mutableStorage' = never,
> extends WgslResolvable,
    WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData, TAllows>;
  fieldIdentifier: WgslIdentifier;

  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;
  flags: GPUBufferUsageFlags;
  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable;
  $allowUniform(): WgslBuffer<TData, TAllows | 'uniform'>;
  $allowReadonlyStorage(): WgslBuffer<TData, TAllows | 'readonlyStorage'>;
  $allowMutableStorage(): WgslBuffer<TData, TAllows | 'mutableStorage'>;
  asUniform(): 'uniform' extends TAllows
    ? WgslBufferUsage<TData, 'uniform'>
    : null;
  asStorage(): 'mutableStorage' extends TAllows
    ? WgslBufferUsage<TData, 'mutableStorage'>
    : null;
  asReadOnlyStorage(): 'readonlyStorage' extends TAllows
    ? WgslBufferUsage<TData, 'readonlyStorage'>
    : null;
  $addFlags(flags: GPUBufferUsageFlags): WgslBuffer<TData, TAllows>;
}

export function buffer<TData extends AnyWgslData>(
  typeSchema: TData,
): WgslBuffer<TData> {
  return new WgslBufferImpl<TData, never>(typeSchema);
}

// --------------
// Implementation
// --------------

class WgslBufferImpl<
  TData extends AnyWgslData,
  TAllows extends 'uniform' | 'readonlyStorage' | 'mutableStorage' = never,
> implements WgslBuffer<TData, TAllows>
{
  public fieldIdentifier = new WgslIdentifier();
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  private allowedUsages: {
    uniform: WgslBufferUsage<TData, TAllows | 'uniform'> | null;
    storage: WgslBufferUsage<TData, TAllows | 'mutableStorage'> | null;
    readOnlyStorage: WgslBufferUsage<TData, TAllows | 'readonlyStorage'> | null;
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
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'uniform'>;
    if (!this.allowedUsages.uniform) {
      this.allowedUsages.uniform = bufferUsage(enrichedThis, 'uniform');
    }
    return enrichedThis;
  }

  $allowReadonlyStorage() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'readonlyStorage'>;
    if (!this.allowedUsages.readOnlyStorage) {
      this.allowedUsages.readOnlyStorage = bufferUsage(
        enrichedThis,
        'readonlyStorage',
      );
    }
    return enrichedThis;
  }

  $allowMutableStorage() {
    const enrichedThis = this as WgslBuffer<TData, TAllows | 'mutableStorage'>;
    if (!this.allowedUsages.storage) {
      this.allowedUsages.storage = bufferUsage(enrichedThis, 'mutableStorage');
    }
    return enrichedThis;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }

  asUniform(): 'uniform' extends TAllows
    ? WgslBufferUsage<TData, 'uniform'>
    : null {
    return this.allowedUsages.uniform as 'uniform' extends TAllows
      ? WgslBufferUsage<TData, 'uniform'>
      : null;
  }

  asStorage(): 'mutableStorage' extends TAllows
    ? WgslBufferUsage<TData, 'mutableStorage'>
    : null {
    return this.allowedUsages.storage as 'mutableStorage' extends TAllows
      ? WgslBufferUsage<TData, 'mutableStorage'>
      : null;
  }

  asReadOnlyStorage(): 'readonlyStorage' extends TAllows
    ? WgslBufferUsage<TData, 'readonlyStorage'>
    : null {
    return this.allowedUsages
      .readOnlyStorage as 'readonlyStorage' extends TAllows
      ? WgslBufferUsage<TData, 'readonlyStorage'>
      : null;
  }
}

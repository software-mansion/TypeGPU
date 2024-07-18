import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { ResolutionCtx, WgslAllocatable, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import type WigsillRuntime from './wigsillRuntime';

// ----------
// Public API
// ----------

export interface WgslBuffer<TData extends AnyWgslData>
  extends WgslResolvable,
    WgslAllocatable<TData> {
  $name(label: string): WgslBuffer<TData>;

  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;
  flags: GPUBufferUsageFlags;
  usage: 'uniform' | 'storage' | 'read-only-storage';
  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable;
  $allowUniform(): WgslBuffer<TData>;
  $allowReadonlyStorage(): WgslBuffer<TData>;
  $allowMutableStorage(): WgslBuffer<TData>;
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
  private fieldIdentifier = new WgslIdentifier();
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  public usage: 'uniform' | 'storage' | 'read-only-storage' = 'uniform';

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
    let bindingType = 'storage, read';

    if (this.usage === 'uniform') {
      bindingType = 'uniform';
    }

    if (this.usage === 'storage') {
      bindingType = 'storage, read_write';
    }

    return code`
    @group(${bindingGroup}) @binding(${bindingIdx}) var<${bindingType}> ${this.fieldIdentifier}: ${this.dataType};
    `;
  }

  // Temporary implementation
  $allowUniform() {
    this.flags =
      GPUBufferUsage.UNIFORM |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC;
    this.usage = 'uniform';
    return this;
  }

  // Temporary implementation
  $allowReadonlyStorage() {
    this.flags =
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC;
    this.usage = 'read-only-storage';
    return this;
  }

  // Temporary implementation
  $allowMutableStorage() {
    this.flags =
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC;
    this.usage = 'storage';
    return this;
  }

  // Temporary solution
  $addFlags(flags: GPUBufferUsageFlags) {
    this.flags |= flags;
    return this;
  }
}

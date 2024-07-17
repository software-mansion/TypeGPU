import { BufferWriter, type Parsed } from 'typed-binary';
import { NotAllocatedMemoryError } from './errors';
import type { AnyWgslData } from './std140/types';
import type {
  ResolutionCtx,
  Wgsl,
  WgslAllocatable,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import type WGSLRuntime from './wgslRuntime';

// ----------
// Public API
// ----------

export interface WgslBuffer<TData extends AnyWgslData>
  extends WgslResolvable,
    WgslAllocatable<TData> {
  alias(label: string): WgslBuffer<TData>;

  write(runtime: WGSLRuntime, data: Parsed<TData>): void;
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
  public structFieldDefinition: Wgsl;

  public debugLabel?: string | undefined;

  constructor(public readonly dataType: TData) {
    this.structFieldDefinition = code`${this.fieldIdentifier}: ${this.dataType},\n`;
  }

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.fieldIdentifier.alias(debugLabel);
    return this;
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  resolve(ctx: ResolutionCtx): string {
    const arena = ctx.arenaFor(this);

    if (!arena) {
      throw new NotAllocatedMemoryError(this);
    }

    const result = `${ctx.resolve(arena.identifier)}.${ctx.resolve(this.fieldIdentifier)}`;

    ctx.resolve(this.structFieldDefinition); // making sure all struct field dependencies are added

    // after resolving all dependencies, add memory.
    ctx.addAllocatable(this);

    return result;
  }

  write(runtime: WGSLRuntime, data: Parsed<TData>): boolean {
    const memoryLocation = runtime.locateMemory(this);

    if (!memoryLocation) {
      console.warn('Cannot write to the memory, as it has not been allocated');
      return false;
    }

    const hostBuffer = new ArrayBuffer(this.dataType.size);
    this.dataType.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      memoryLocation.gpuBuffer,
      memoryLocation.offset,
      hostBuffer,
      0,
      this.dataType.size,
    );

    return true;
  }
}

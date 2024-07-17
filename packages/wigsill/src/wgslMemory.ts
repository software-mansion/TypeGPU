import { BufferWriter, type Parsed } from 'typed-binary';
import { NotAllocatedMemoryError } from './errors';
import type { AnyWgslData } from './std140/types';
import type {
  ResolutionCtx,
  WGSLMemoryTrait,
  Wgsl,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import type WGSLRuntime from './wgslRuntime';

export class WGSLMemory<TSchema extends AnyWgslData>
  implements WgslResolvable, WGSLMemoryTrait
{
  private fieldIdentifier = new WgslIdentifier();
  public structFieldDefinition: Wgsl;

  public debugLabel?: string | undefined;
  public readonly size: number;
  public readonly baseAlignment: number;

  constructor(private readonly _typeSchema: TSchema) {
    this.structFieldDefinition = code`${this.fieldIdentifier}: ${this._typeSchema},\n`;
    this.size = this._typeSchema.size;
    this.baseAlignment = this._typeSchema.byteAlignment;
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
    ctx.addMemory(this);

    return result;
  }

  write(runtime: WGSLRuntime, data: Parsed<TSchema>): boolean {
    const memoryLocation = runtime.locateMemory(this);

    if (!memoryLocation) {
      console.warn('Cannot write to the memory, as it has not been allocated');
      return false;
    }

    const hostBuffer = new ArrayBuffer(this.size);
    this._typeSchema.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      memoryLocation.gpuBuffer,
      memoryLocation.offset,
      hostBuffer,
      0,
      this.size,
    );

    return true;
  }
}

export function memory<TSchema extends AnyWgslData>(typeSchema: TSchema) {
  return new WGSLMemory(typeSchema);
}

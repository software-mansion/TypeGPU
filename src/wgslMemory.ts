import { BufferWriter, MaxValue } from 'typed-binary';
import { NotAllocatedMemoryError } from './errors';
import { AlignedSchema } from './std140';
import {
  IResolutionCtx,
  WGSLItem,
  WGSLMemoryTrait,
  WGSLSegment,
} from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';
import WGSLRuntime from './wgslRuntime';

export class WGSLMemory<T> implements WGSLItem, WGSLMemoryTrait {
  private fieldIdentifier = new WGSLIdentifier();

  public debugLabel?: string | undefined;
  public readonly size: number;
  public readonly baseAlignment: number;

  constructor(
    public readonly typeExpr: WGSLSegment,
    private readonly typeSchema: AlignedSchema<T>,
  ) {
    this.size = this.typeSchema.measure(MaxValue).size;
    this.baseAlignment = this.typeSchema.baseAlignment;
  }

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.fieldIdentifier.alias(debugLabel);
  }

  get structFieldDefinition(): WGSLSegment {
    return code`${this.fieldIdentifier}: ${this.typeExpr},\n`;
  }

  write(runtime: WGSLRuntime, data: T): boolean {
    const memoryLocation = runtime.locateMemory(this);

    if (!memoryLocation) {
      console.warn(`Cannot write to the memory, as it has not been allocated`);
      return false;
    }

    const hostBuffer = new ArrayBuffer(this.size);
    this.typeSchema.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      memoryLocation.gpuBuffer,
      memoryLocation.offset,
      hostBuffer,
      0,
      this.size,
    );

    return true;
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  resolve(ctx: IResolutionCtx): string {
    ctx.addMemory(this);
    ctx.resolve(this.typeExpr); // Adding dependencies of this entry

    const arena = ctx.arenaFor(this);

    if (!arena) {
      throw new NotAllocatedMemoryError(this);
    }

    return (
      ctx.resolve(arena.identifier) + '.' + ctx.resolve(this.fieldIdentifier)
    );
  }
}

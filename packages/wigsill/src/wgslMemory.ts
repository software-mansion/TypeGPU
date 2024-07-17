import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { NotAllocatedMemoryError } from './errors';
import type { AnyWGSLDataType } from './std140/types';
import type { ResolutionCtx, WGSLItem, WGSLMemoryTrait } from './types';
import { type WGSLCode, code } from './wgslCode';
import { identifier } from './wgslIdentifier';
import type WGSLRuntime from './wgslRuntime';

export class WGSLMemory<TSchema extends AnyWGSLDataType>
  implements WGSLItem, WGSLMemoryTrait
{
  private fieldIdentifier = identifier();

  public debugLabel?: string | undefined;
  public readonly size: number;
  public readonly baseAlignment: number;
  public usage: 'uniform' | 'storage' = 'uniform';
  public flags: GPUBufferUsageFlags =
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

  constructor(private readonly _typeSchema: TSchema) {
    this.size = this._typeSchema.size;
    this.baseAlignment = this._typeSchema.byteAlignment;
  }

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.fieldIdentifier.alias(debugLabel);
    return this;
  }

  setFlags(flags: GPUBufferUsageFlags) {
    this.flags = flags;
    if (flags & GPUBufferUsage.STORAGE) {
      this.usage = 'storage';
    }
    return this;
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  resolve(ctx: ResolutionCtx): string {
    // after resolving all dependencies, add memory.
    ctx.registerMemory(this);

    return ctx.resolve(this.fieldIdentifier);
  }

  write(runtime: WGSLRuntime, data: Parsed<TSchema>): boolean {
    const memoryLocation = runtime.bufferFor(this);

    if (!memoryLocation) {
      console.warn('Cannot write to the memory, as it has not been allocated');
      return false;
    }

    const hostBuffer = new ArrayBuffer(this.size);
    this._typeSchema.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      memoryLocation,
      0,
      hostBuffer,
      0,
      this.size,
    );

    return true;
  }

  async read(runtime: WGSLRuntime) {
    const arrayBuffer = await runtime.valueFor(this);
    if (!arrayBuffer) {
      throw new Error('Value could not be received by runtime');
    }

    const res = this._typeSchema.read(new BufferReader(arrayBuffer));
    return res;
  }

  definitionCode(bindingGroup: number, bindingIdx: number) {
    let bindingType = 'storage, read';

    if (this.usage === 'uniform') {
      bindingType = 'uniform';
    }

    if (this.usage === 'storage') {
      bindingType = 'storage, read_write';
    }

    return code`
    @group(${bindingGroup}) @binding(${bindingIdx}) var<${bindingType}> ${this.fieldIdentifier}: ${this._typeSchema};
    `;
  }
}

export function memory<TSchema extends AnyWGSLDataType>(typeSchema: TSchema) {
  return new WGSLMemory(typeSchema);
}

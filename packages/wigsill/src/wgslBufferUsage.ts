import type { Parsed } from 'typed-binary';
import type { AnyWgslData } from './std140/types';
import type { ResolutionCtx, WgslAllocatable, WgslResolvable } from './types';
import type { WgslBuffer } from './wgslBuffer';
import { code } from './wgslCode';
import type WigsillRuntime from './wigsillRuntime';

export interface WgslBufferUsage<
  TData extends AnyWgslData,
  TUsage extends 'uniform' | 'readonlyStorage' | 'mutableStorage',
> extends WgslAllocatable<TData> {
  readonly buffer: WgslBuffer<TData, TUsage>;
  readonly usage: TUsage;
  write(runtime: WigsillRuntime, data: Parsed<TData>): void;
  read(runtime: WigsillRuntime): Promise<Parsed<TData>>;
}

export function bufferUsage<
  TData extends AnyWgslData,
  TUsage extends 'uniform' | 'readonlyStorage' | 'mutableStorage',
>(
  buffer: WgslBuffer<TData, TUsage>,
  usage: TUsage,
): WgslBufferUsage<TData, TUsage> {
  return new WgslBufferUsageImpl(buffer, usage);
}

class WgslBufferUsageImpl<
  TData extends AnyWgslData,
  TUsage extends 'uniform' | 'readonlyStorage' | 'mutableStorage',
> implements WgslBufferUsage<TData, TUsage>
{
  public readonly flags: GPUBufferUsageFlags;
  public readonly dataType: TData;

  constructor(
    public readonly buffer: WgslBuffer<TData, TUsage>,
    public readonly usage: TUsage,
  ) {
    this.flags = buffer.flags;
    this.dataType = buffer.dataType;
  }

  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable {
    let bindingType = 'storage, read';

    if (this.usage === 'uniform') {
      bindingType = 'uniform';
    }

    if (this.usage === 'mutableStorage') {
      bindingType = 'storage, read_write';
    }

    return code`
    @group(${bindingGroup}) @binding(${bindingIdx}) var<${bindingType}> ${this.buffer.fieldIdentifier}: ${this.dataType};
    `;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addBufferUsage(this);

    return this.buffer.resolve(ctx);
  }

  write(runtime: WigsillRuntime, data: Parsed<TData>): void {
    this.buffer.write(runtime, data);
  }

  read(runtime: WigsillRuntime): Promise<Parsed<TData>> {
    return this.buffer.read(runtime);
  }
}

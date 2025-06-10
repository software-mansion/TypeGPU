import { setName, type TgpuNamable } from '../../shared/meta.ts';
import type { ExperimentalTgpuRoot } from '../../core/root/rootTypes.ts';
import { $internal } from '../../shared/symbols.ts';

export interface TgpuQuerySet<T extends GPUQueryType> extends TgpuNamable {
  readonly resourceType: 'query-set';
  readonly type: T;
  readonly count: number;

  readonly querySet: GPUQuerySet;
  readonly destroyed: boolean;
  readonly available: boolean;

  readonly [$internal]: {
    readBuffer: GPUBuffer | null;
    resolveBuffer: GPUBuffer | null;
  };

  resolve(): void;
  read(): Promise<bigint[]>;
  destroy(): void;
}

export function INTERNAL_createQuerySet<T extends GPUQueryType>(
  group: ExperimentalTgpuRoot,
  type: T,
  count: number,
  rawQuerySet?: GPUQuerySet,
): TgpuQuerySet<T> {
  return new TgpuQuerySetImpl(group, type, count, rawQuerySet);
}

export function isQuerySet<T extends GPUQueryType>(
  value: unknown,
): value is TgpuQuerySet<T> {
  return (value as TgpuQuerySet<T>)?.resourceType === 'query-set';
}

class TgpuQuerySetImpl<T extends GPUQueryType> implements TgpuQuerySet<T> {
  public readonly resourceType = 'query-set';
  private _querySet: GPUQuerySet | null = null;
  private _ownQuerySet: boolean;
  private _destroyed = false;
  private _available = true;
  [$internal]: {
    readBuffer: GPUBuffer | null;
    resolveBuffer: GPUBuffer | null;
  } = {
    readBuffer: null,
    resolveBuffer: null,
  };

  constructor(
    private readonly _group: ExperimentalTgpuRoot,
    public readonly type: T,
    public readonly count: number,
    private readonly rawQuerySet?: GPUQuerySet,
  ) {
    if (rawQuerySet) {
      this._ownQuerySet = false;
      this._querySet = rawQuerySet;
    } else {
      this._ownQuerySet = true;
    }
  }

  get querySet(): GPUQuerySet {
    const device = this._group.device;

    if (this._destroyed) {
      throw new Error('QuerySet has been destroyed.');
    }

    if (this.rawQuerySet) {
      return this.rawQuerySet;
    }

    if (this._querySet) {
      return this._querySet;
    }

    this._querySet = device.createQuerySet({
      type: this.type,
      count: this.count,
    });

    return this._querySet;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  get available(): boolean {
    return this._available;
  }

  $name(label: string) {
    setName(this, label);
    if (this._querySet) {
      this._querySet.label = label;
    }
    return this;
  }

  resolve(): void {
    if (this._destroyed) {
      throw new Error('This QuerySet has been destroyed.');
    }

    if (!this._available) {
      throw new Error('This QuerySet is busy resolving or reading.');
    }

    if (!this[$internal].resolveBuffer) {
      this[$internal].resolveBuffer = this._group.device.createBuffer({
        size: this.count * BigUint64Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
    }

    const commandEncoder = this._group.device.createCommandEncoder();
    commandEncoder.resolveQuerySet(
      this.querySet,
      0,
      this.count,
      this[$internal].resolveBuffer,
      0,
    );
    this._group.device.queue.submit([commandEncoder.finish()]);
  }

  async read(): Promise<bigint[]> {
    this._group.flush();

    if (!this[$internal].resolveBuffer) {
      throw new Error(
        'QuerySet was read before it was resolved. Resolve the query set first.',
      );
    }

    this._available = false;

    if (!this[$internal].readBuffer) {
      this[$internal].readBuffer = this._group.device.createBuffer({
        size: this.count * BigUint64Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }

    const commandEncoder = this._group.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      this[$internal].resolveBuffer,
      0,
      this[$internal].readBuffer,
      0,
      this.count * BigUint64Array.BYTES_PER_ELEMENT,
    );
    this._group.device.queue.submit([commandEncoder.finish()]);
    await this._group.device.queue.onSubmittedWorkDone();

    await this[$internal].readBuffer.mapAsync(GPUMapMode.READ);
    const data = new BigUint64Array(
      this[$internal].readBuffer.getMappedRange().slice(),
    );
    this[$internal].readBuffer.unmap();

    this._available = true;
    return Array.from(data);
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    if (this._querySet && this._ownQuerySet) {
      this._querySet.destroy();
    }

    if (this[$internal].readBuffer) {
      this[$internal].readBuffer.destroy();
      this[$internal].readBuffer = null;
    }

    if (this[$internal].resolveBuffer) {
      this[$internal].resolveBuffer.destroy();
      this[$internal].resolveBuffer = null;
    }
  }
}

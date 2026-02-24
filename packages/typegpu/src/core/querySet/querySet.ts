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
    readonly readBuffer: GPUBuffer;
    readonly resolveBuffer: GPUBuffer;
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
  const maybe = value as TgpuQuerySet<T>;
  return maybe?.resourceType === 'query-set' && !!maybe[$internal];
}

class TgpuQuerySetImpl<T extends GPUQueryType> implements TgpuQuerySet<T> {
  public readonly resourceType = 'query-set' as const;

  readonly #device: GPUDevice;
  private _querySet: GPUQuerySet | null = null;
  private readonly _ownQuerySet: boolean;
  private _destroyed = false;
  private _available = true;
  private _readBuffer: GPUBuffer | null = null;
  private _resolveBuffer: GPUBuffer | null = null;

  constructor(
    root: ExperimentalTgpuRoot,
    public readonly type: T,
    public readonly count: number,
    private readonly rawQuerySet?: GPUQuerySet,
  ) {
    this.#device = root.device;
    this._ownQuerySet = !rawQuerySet;
    this._querySet = rawQuerySet || null;
  }

  get querySet(): GPUQuerySet {
    if (this._destroyed) {
      throw new Error('This QuerySet has been destroyed.');
    }
    if (this.rawQuerySet) {
      return this.rawQuerySet;
    }
    if (this._querySet) {
      return this._querySet;
    }

    this._querySet = this.#device.createQuerySet({
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

  get [$internal]() {
    // oxlint-disable-next-line typescript/no-this-alias
    const self = this;
    return {
      get readBuffer(): GPUBuffer {
        if (!self._readBuffer) {
          self._readBuffer = self.#device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
        }
        return self._readBuffer;
      },
      get resolveBuffer(): GPUBuffer {
        if (!self._resolveBuffer) {
          self._resolveBuffer = self.#device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
        }
        return self._resolveBuffer;
      },
    };
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

    const commandEncoder = this.#device.createCommandEncoder();
    commandEncoder.resolveQuerySet(
      this.querySet,
      0,
      this.count,
      this[$internal].resolveBuffer,
      0,
    );
    this.#device.queue.submit([commandEncoder.finish()]);
  }

  async read(): Promise<bigint[]> {
    if (!this._resolveBuffer) {
      throw new Error('QuerySet must be resolved before reading.');
    }

    this._available = false;
    try {
      const commandEncoder = this.#device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        this[$internal].resolveBuffer,
        0,
        this[$internal].readBuffer,
        0,
        this.count * BigUint64Array.BYTES_PER_ELEMENT,
      );
      this.#device.queue.submit([commandEncoder.finish()]);

      const readBuffer = this[$internal].readBuffer;
      await readBuffer.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(readBuffer.getMappedRange().slice());
      readBuffer.unmap();
      return Array.from(data);
    } finally {
      this._available = true;
    }
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    if (this._querySet && this._ownQuerySet) {
      this._querySet.destroy();
    }
    this._readBuffer?.destroy();
    this._resolveBuffer?.destroy();
    this._readBuffer = this._resolveBuffer = null;
  }
}

import { setName, type TgpuNamable } from '../../shared/meta.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuDeviceOwningSoul } from '../../shared/soul.ts';
import { $internal, $soul } from '../../shared/symbols.ts';

export interface TgpuQuerySetSoul<
  T extends GPUQueryType = GPUQueryType,
> extends TgpuDeviceOwningSoul<'query-set', GPUQuerySet> {
  readonly queryType: T;
  readonly count: number;
}

export interface TgpuQuerySet<T extends GPUQueryType> extends TgpuNamable {
  readonly resourceType: 'query-set';
  readonly type: T;
  readonly count: number;

  readonly querySet: GPUQuerySet;
  readonly destroyed: boolean;
  readonly available: boolean;

  readonly [$soul]: TgpuQuerySetSoul<T>;
  readonly [$internal]: {
    readonly readBuffer: GPUBuffer;
    readonly resolveBuffer: GPUBuffer;
    readonly materialize: () => GPUQuerySet;
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

export function isQuerySet<T extends GPUQueryType>(value: unknown): value is TgpuQuerySet<T> {
  const maybe = value as TgpuQuerySet<T>;
  return maybe?.resourceType === 'query-set' && !!maybe[$internal];
}

class TgpuQuerySetImpl<T extends GPUQueryType> implements TgpuQuerySet<T> {
  readonly resourceType = 'query-set' as const;

  readonly #ownQuerySet: boolean;
  #destroyed = false;
  #available = true;
  #readBuffer: GPUBuffer | undefined = undefined;
  #resolveBuffer: GPUBuffer | undefined = undefined;

  readonly [$soul]: TgpuQuerySetSoul<T>;
  readonly [$internal]: {
    readonly readBuffer: GPUBuffer;
    readonly resolveBuffer: GPUBuffer;
    readonly materialize: () => GPUQuerySet;
  };

  constructor(root: ExperimentalTgpuRoot, type: T, count: number, rawQuerySet?: GPUQuerySet) {
    this.#ownQuerySet = !rawQuerySet;

    this[$soul] = {
      type: 'query-set',
      device: root.device,
      queryType: type,
      count,
      raw: rawQuerySet,
      label: undefined,
    };

    // oxlint-disable-next-line typescript/no-this-alias
    const self = this;
    this[$internal] = {
      get readBuffer(): GPUBuffer {
        if (!self.#readBuffer) {
          self.#readBuffer = self[$soul].device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
        }
        return self.#readBuffer;
      },
      get resolveBuffer(): GPUBuffer {
        if (!self.#resolveBuffer) {
          self.#resolveBuffer = self[$soul].device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
        }
        return self.#resolveBuffer;
      },
      materialize: () => {
        if (this.#destroyed) {
          throw new Error('This QuerySet has been destroyed.');
        }

        const soul = this[$soul];
        if (!soul.raw) {
          soul.raw = soul.device.createQuerySet({
            type: soul.queryType,
            count: soul.count,
          });
        }
        return soul.raw;
      },
    };
  }

  get type(): T {
    return this[$soul].queryType;
  }

  get count(): number {
    return this[$soul].count;
  }

  get querySet(): GPUQuerySet {
    return this[$internal].materialize();
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  get available(): boolean {
    return this.#available;
  }

  $name(label: string) {
    setName(this, label);
    const raw = this[$soul].raw;
    if (raw) {
      raw.label = label;
    }
    return this;
  }

  resolve(): void {
    if (this.#destroyed) {
      throw new Error('This QuerySet has been destroyed.');
    }
    if (!this.#available) {
      throw new Error('This QuerySet is busy resolving or reading.');
    }

    const commandEncoder = this[$soul].device.createCommandEncoder();
    commandEncoder.resolveQuerySet(this.querySet, 0, this.count, this[$internal].resolveBuffer, 0);
    this[$soul].device.queue.submit([commandEncoder.finish()]);
  }

  async read(): Promise<bigint[]> {
    if (!this.#resolveBuffer) {
      throw new Error('QuerySet must be resolved before reading.');
    }

    this.#available = false;
    try {
      const commandEncoder = this[$soul].device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        this[$internal].resolveBuffer,
        0,
        this[$internal].readBuffer,
        0,
        this.count * BigUint64Array.BYTES_PER_ELEMENT,
      );
      this[$soul].device.queue.submit([commandEncoder.finish()]);

      const readBuffer = this[$internal].readBuffer;
      await readBuffer.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(readBuffer.getMappedRange().slice());
      readBuffer.unmap();
      return Array.from(data);
    } finally {
      this.#available = true;
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;

    if (this[$soul].raw && this.#ownQuerySet) {
      this[$soul].raw.destroy();
    }
    this.#readBuffer?.destroy();
    this.#resolveBuffer?.destroy();
    this.#readBuffer = this.#resolveBuffer = undefined;
  }
}

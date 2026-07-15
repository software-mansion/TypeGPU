import { setName, type TgpuNamable } from '../../shared/meta.ts';
import type { ExperimentalTgpuRoot, TgpuRoot } from '../root/rootTypes.ts';
import type { RestoreContext } from '../../serial/types.ts';
import { $internal } from '../../shared/symbols.ts';

export interface TgpuQuerySet<T extends GPUQueryType> extends TgpuNamable {
  readonly resourceType: 'query-set';
  readonly root: TgpuRoot;
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

export function isQuerySet<T extends GPUQueryType>(value: unknown): value is TgpuQuerySet<T> {
  const maybe = value as TgpuQuerySet<T>;
  return maybe?.resourceType === 'query-set' && !!maybe[$internal];
}

export interface TgpuQuerySetSnapshot {
  readonly type: 'query-set';
  readonly device: GPUDevice;
  readonly querySet: GPUQuerySet;
  readonly queryType: GPUQueryType;
  readonly count: number;
}

export function INTERNAL_snapshotQuerySet(
  querySet: TgpuQuerySet<GPUQueryType>,
): TgpuQuerySetSnapshot {
  return {
    type: 'query-set',
    device: querySet.root.device,
    querySet: querySet.querySet,
    queryType: querySet.type,
    count: querySet.count,
  };
}

export function INTERNAL_restoreQuerySet(
  snapshot: TgpuQuerySetSnapshot,
  ctx: RestoreContext,
): TgpuQuerySet<GPUQueryType> {
  return ctx
    .getRoot(snapshot.device)
    .createQuerySet(snapshot.queryType, snapshot.count, snapshot.querySet);
}

class TgpuQuerySetImpl<T extends GPUQueryType> implements TgpuQuerySet<T> {
  readonly resourceType = 'query-set' as const;
  readonly root: TgpuRoot;
  readonly type: T;
  readonly count: number;

  readonly #rawQuerySet: GPUQuerySet | undefined;
  #querySet: GPUQuerySet | undefined;
  readonly #ownQuerySet: boolean;
  #destroyed = false;
  #available = true;
  #readBuffer: GPUBuffer | undefined = undefined;
  #resolveBuffer: GPUBuffer | undefined = undefined;

  constructor(root: ExperimentalTgpuRoot, type: T, count: number, rawQuerySet?: GPUQuerySet) {
    this.root = root;
    this.type = type;
    this.count = count;
    this.#rawQuerySet = rawQuerySet;
    this.#ownQuerySet = !rawQuerySet;
    this.#querySet = rawQuerySet;
  }

  get querySet(): GPUQuerySet {
    if (this.#destroyed) {
      throw new Error('This QuerySet has been destroyed.');
    }
    if (this.#rawQuerySet) {
      return this.#rawQuerySet;
    }
    if (this.#querySet) {
      return this.#querySet;
    }

    this.#querySet = this.root.device.createQuerySet({
      type: this.type,
      count: this.count,
    });
    return this.#querySet;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  get available(): boolean {
    return this.#available;
  }

  get [$internal]() {
    // oxlint-disable-next-line typescript/no-this-alias
    const self = this;
    return {
      get readBuffer(): GPUBuffer {
        if (!self.#readBuffer) {
          self.#readBuffer = self.root.device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
        }
        return self.#readBuffer;
      },
      get resolveBuffer(): GPUBuffer {
        if (!self.#resolveBuffer) {
          self.#resolveBuffer = self.root.device.createBuffer({
            size: self.count * BigUint64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
        }
        return self.#resolveBuffer;
      },
    };
  }

  $name(label: string) {
    setName(this, label);
    if (this.#querySet) {
      this.#querySet.label = label;
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

    const commandEncoder = this.root.device.createCommandEncoder();
    commandEncoder.resolveQuerySet(this.querySet, 0, this.count, this[$internal].resolveBuffer, 0);
    this.root.device.queue.submit([commandEncoder.finish()]);
  }

  async read(): Promise<bigint[]> {
    if (!this.#resolveBuffer) {
      throw new Error('QuerySet must be resolved before reading.');
    }

    this.#available = false;
    try {
      const commandEncoder = this.root.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        this[$internal].resolveBuffer,
        0,
        this[$internal].readBuffer,
        0,
        this.count * BigUint64Array.BYTES_PER_ELEMENT,
      );
      this.root.device.queue.submit([commandEncoder.finish()]);

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

    if (this.#querySet && this.#ownQuerySet) {
      this.#querySet.destroy();
    }
    this.#readBuffer?.destroy();
    this.#resolveBuffer?.destroy();
    this.#readBuffer = this.#resolveBuffer = undefined;
  }
}

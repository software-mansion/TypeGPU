import type { TgpuComputePipeline } from '../../core/pipeline/computePipeline.ts';
import { isQuerySet, type TgpuQuerySet } from '../../core/querySet/querySet.ts';
import type { TgpuRenderPipeline } from '../../core/pipeline/renderPipeline.ts';
import type { ExperimentalTgpuRoot } from '../../core/root/rootTypes.ts';
import { $internal } from '../../shared/symbols.ts';

export interface Timeable<T extends TgpuComputePipeline | TgpuRenderPipeline> {
  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): T;

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): T;
}

export type TimestampWritesPriors = {
  readonly timestampWrites?: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  };
  readonly withPerformanceCallback?: (
    start: bigint,
    end: bigint,
  ) => void | Promise<void>;
  readonly hasAutoQuerySet?: boolean;
};

export function createWithPerformanceCallback<T extends TimestampWritesPriors>(
  currentPriors: T,
  callback: (start: bigint, end: bigint) => void | Promise<void>,
  root: ExperimentalTgpuRoot,
): T {
  if (!root.enabledFeatures.has('timestamp-query')) {
    throw new Error(
      'Performance callback requires the "timestamp-query" feature to be enabled on GPU device.',
    );
  }

  if (!currentPriors.timestampWrites) {
    return {
      ...currentPriors,
      withPerformanceCallback: callback,
      hasAutoQuerySet: true,
      timestampWrites: {
        querySet: root.createQuerySet('timestamp', 2),
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    } as T;
  }

  return {
    ...currentPriors,
    withPerformanceCallback: callback,
  } as T;
}

export function createWithTimestampWrites<T extends TimestampWritesPriors>(
  currentPriors: T,
  options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  },
  root: ExperimentalTgpuRoot,
): T {
  if (!root.enabledFeatures.has('timestamp-query')) {
    throw new Error(
      'Timestamp writes require the "timestamp-query" feature to be enabled on GPU device.',
    );
  }

  if (currentPriors.hasAutoQuerySet) {
    if (currentPriors.timestampWrites) {
      currentPriors.timestampWrites.querySet.destroy();
    }
  }

  const timestampWrites: TimestampWritesPriors['timestampWrites'] = {
    querySet: options.querySet,
  };

  if (options.beginningOfPassWriteIndex !== undefined) {
    timestampWrites.beginningOfPassWriteIndex =
      options.beginningOfPassWriteIndex;
  }
  if (options.endOfPassWriteIndex !== undefined) {
    timestampWrites.endOfPassWriteIndex = options.endOfPassWriteIndex;
  }

  return {
    ...currentPriors,
    hasAutoQuerySet: false,
    timestampWrites,
  } as T;
}

export function setupTimestampWrites(
  priors: TimestampWritesPriors,
  root: ExperimentalTgpuRoot,
): {
  timestampWrites?:
    | GPUComputePassTimestampWrites
    | GPURenderPassTimestampWrites;
} {
  if (!priors.timestampWrites) {
    return {};
  }

  const { querySet, beginningOfPassWriteIndex, endOfPassWriteIndex } =
    priors.timestampWrites;

  const timestampWrites:
    | GPUComputePassTimestampWrites
    | GPURenderPassTimestampWrites = {
      querySet: isQuerySet(querySet) ? root.unwrap(querySet) : querySet,
    };

  if (beginningOfPassWriteIndex !== undefined) {
    timestampWrites.beginningOfPassWriteIndex = beginningOfPassWriteIndex;
  }
  if (endOfPassWriteIndex !== undefined) {
    timestampWrites.endOfPassWriteIndex = endOfPassWriteIndex;
  }

  return { timestampWrites };
}

export function handlePerformanceCallback(
  priors: TimestampWritesPriors,
  root: ExperimentalTgpuRoot,
  defaultFlush?: () => void,
): void {
  const callback = priors.withPerformanceCallback;
  if (callback) {
    triggerPerformanceCallback({ root, priors });
  } else if (defaultFlush) {
    defaultFlush();
  }
}

export function triggerPerformanceCallback({
  root,
  priors,
}: {
  root: ExperimentalTgpuRoot;
  priors: TimestampWritesPriors;
}): void | Promise<void> {
  const querySet = priors.timestampWrites?.querySet;
  const callback = priors.withPerformanceCallback as (
    start: bigint,
    end: bigint,
  ) => void | Promise<void>;

  if (!querySet) {
    throw new Error(
      'Cannot dispatch workgroups with performance callback without a query set.',
    );
  }

  if (!isQuerySet(querySet)) {
    throw new Error(
      'Performance callback with raw GPUQuerySet is not supported. Use TgpuQuerySet instead.',
    );
  }

  root.commandEncoder.resolveQuerySet(
    root.unwrap(querySet),
    0,
    querySet.count,
    querySet[$internal].resolveBuffer,
    0,
  );

  root.flush();
  root.device.queue.onSubmittedWorkDone().then(async () => {
    if (!querySet.available) {
      return;
    }
    const result = await querySet.read();
    const start =
      result[priors.timestampWrites?.beginningOfPassWriteIndex ?? 0];
    const end = result[priors.timestampWrites?.endOfPassWriteIndex ?? 1];

    if (start === undefined || end === undefined) {
      throw new Error('QuerySet did not return valid timestamps.');
    }

    await callback(start, end);
  });
}
